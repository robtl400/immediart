/**
 * Met Museum Collection API Service
 */

import {
  API_BASE_URL,
  MAX_RETRIES,
  RATE_LIMIT_DELAYS,
} from '../utils/constants';
import {
  getCachedIDs,
  setCachedIDs,
  getCachedArtwork,
  setCachedArtwork,
  removeCachedArtwork
} from './artworkCache';
import { addJitter, delayOrAbort } from '../utils/delay';
import { requestManager, CIRCUIT_BREAKER_OPEN } from './requestManager';

// Fetch with retry for transient NETWORK errors — delegates throttle to
// requestManager. A 403 is returned immediately, never retried: the Imperva
// penalty lasts ~60s (measured — scripts/API-FINDINGS.md), so a 1s/2s/4s
// ladder would burn every retry inside the block and possibly extend it.
// The circuit breaker owns 403 recovery.
async function fetchWithRetry(url, signal = null) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      return await requestManager.fetch(url, signal);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error.message === CIRCUIT_BREAKER_OPEN) throw error;
      if (i === MAX_RETRIES - 1) throw error;
      await delayOrAbort(addJitter(RATE_LIMIT_DELAYS[i] || RATE_LIMIT_DELAYS.at(-1)), signal);
    }
  }
}

// Search API
export async function search(query, { artistMode = false, medium = null, signal = null } = {}) {
  // The Met search endpoint is parameter-order sensitive: q must be serialized
  // LAST. A boolean filter appearing after q is not just ignored — it zeroes
  // the result set (verified live 2026-07-07: ...&q=Rembrandt&artistOrCulture=true
  // returns total:0, while ...&artistOrCulture=true&q=Rembrandt returns 421).
  const params = new URLSearchParams({ hasImages: 'true' });
  if (artistMode) params.set('artistOrCulture', 'true');
  if (medium) params.set('medium', medium);
  params.set('q', query);
  const url = `${API_BASE_URL}/search?${params}`;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const response = await fetchWithRetry(url, signal);
  if (response.ok) {
    let data;
    try {
      data = await response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      // A 200 whose body isn't JSON is an Imperva block page served with a
      // success status — definitive ban evidence; trips the breaker (the
      // transport layer recorded the 200 as a success, so counting alone
      // would never reach the threshold). Only a SyntaxError qualifies —
      // body-stream TypeErrors are local read problems, not ban evidence.
      if (err instanceof SyntaxError) requestManager.reportBlockPage();
      throw new Error('Search failed: non-JSON response (block page)');
    }
    return data.objectIDs || [];
  }
  throw new Error(`Search failed: ${response.status}`);
}

// Convenience wrappers — cache result in IndexedDB with named keys
export async function fetchAllObjectIDs(signal) {
  const cached = await getCachedIDs('ids:feed:paintings-v2');
  // length guard (not truthy) — a cached empty array must be a miss, same as
  // cachedSearch below, or a poisoned entry would blank the feed for 24h.
  if (cached?.length > 0) return cached;
  const ids = await search('painting', { medium: 'Paintings', signal });
  if (ids.length === 0) {
    console.warn('[metAPI] fetchAllObjectIDs returned 0 IDs — skipping cache');
    return ids;
  }
  await setCachedIDs('ids:feed:paintings-v2', ids);
  return ids;
}

// Empty results are NOT written to IndexedDB (a transient API hiccup would
// lock "no results" in for 24h), but they ARE remembered in a short-TTL
// in-memory negative cache — otherwise hover prefetch re-fires the search
// on every mouseenter for terms that legitimately return nothing.
const EMPTY_SEARCH_TTL_MS = 5 * 60 * 1000;
const emptySearchCache = new Map(); // cache key -> timestamp of empty result

// Test hook — module-level state would otherwise leak between tests
export function _clearEmptySearchCache() {
  emptySearchCache.clear();
}

// Shared cache-then-search wrapper for artist/tag ID lookups.
// A cached EMPTY array is treated as a miss: builds before the empty-guard
// wrote `[]` to IndexedDB with a 24h TTL, and honoring those legacy entries
// would keep the poisoned "no results" alive after the fix ships.
async function cachedSearch(key, runSearch) {
  const cached = await getCachedIDs(key);
  if (cached?.length > 0) return cached;

  const emptyAt = emptySearchCache.get(key);
  if (emptyAt && Date.now() - emptyAt < EMPTY_SEARCH_TTL_MS) return [];

  const ids = await runSearch();
  if (ids.length === 0) {
    console.warn(`[metAPI] search "${key}" returned 0 IDs — negative-cached for ${EMPTY_SEARCH_TTL_MS / 60000}min`);
    emptySearchCache.set(key, Date.now());
    return ids;
  }
  emptySearchCache.delete(key);
  await setCachedIDs(key, ids);
  return ids;
}

export async function searchByArtist(name, signal) {
  return cachedSearch(`ids:artist:${name}`, () => search(name, { artistMode: true, signal }));
}

export async function searchByTag(term, signal) {
  return cachedSearch(`ids:tag:${term}`, () => search(term, { signal }));
}

// Free-text search from the banner search box. Same underlying full-text
// endpoint as searchByTag, but keyed separately (ids:search:) so a typed query
// and a tag chip of the same word don't clobber each other's cache slot.
export async function searchByQuery(term, signal) {
  return cachedSearch(`ids:search:${term}`, () => search(term, { signal }));
}

// Allowed object types — expanded from 'painting' only based on live API sampling.
const OBJECT_TYPES = [
  'painting',
  'watercolor',
  'fresco',
  'mural',
  'portrait',
  'thangka',
  'kakemono',
];

// strict=true applies the OBJECT_TYPES allowlist (feed only). Artist/tag searches use strict=false
// so all medium types (prints, drawings, sculptures, etc.) are included.
export function validateArtwork(artwork, { strict = false } = {}) {
  const name = artwork?.objectName?.toLowerCase() ?? '';
  return Boolean(
    artwork?.primaryImage?.trim() &&
    artwork?.title?.trim() &&
    (!strict || OBJECT_TYPES.some(type => name.startsWith(type)))
  );
}

// A cached entry is a real API object (vs a corrupt/misfiled write) only when
// it carries the id it was stored under — this is the negative-cache contract:
// real-but-invalid objects answer 'invalid' from cache; anything else is
// evicted and refetched.
const isRealApiObject = (obj, objectID) => String(obj?.objectID ?? '') === String(objectID);

// Baseline-invalid rejects (no open-access image / no title) may be transient
// API degradation rather than a permanent property of the object — cache them
// on a short TTL so a hiccup can't hide a liked artwork or deep link for the
// full 7-day artwork TTL. Stable rejects (baseline-valid, wrong medium) keep
// the default TTL.
const TTL_INVALID_ARTWORK_MS = 86400000; // 24h

// Per-ID fetch outcome (used by batchFetchArtworks + /liked prune logic):
//   'used'     — fetched (or cache-hit) and passed the caller's strictness
//   'invalid'  — fetched but failed validation (no image, wrong medium, or a
//                strict-mismatch like the feed reading a grid-cached print)
//   'notFound' — definitive HTTP 404 (safe to prune a saved like)
//   'error'    — network error / non-404 non-ok response (transient; never prune)
// Abort and circuit-breaker-open are thrown, never reported as an outcome.

// Fetch single artwork with its outcome (cache + in-flight dedup via requestManager)
export async function fetchArtworkWithStatus(objectID, signal = null, { strict = false } = {}) {
  // 1. Cache check — re-validate on read: the cache is shared between strict (feed)
  // and non-strict (grid) callers, and it stores validation REJECTS too (negative
  // cache), so a hit must be re-validated against the caller's own strictness.
  const cached = await getCachedArtwork(objectID);
  if (cached) {
    if (isRealApiObject(cached, objectID)) {
      if (validateArtwork(cached, { strict })) return { artwork: cached, status: 'used', fromCache: true };
      // A real API object that fails this caller's validation — a correct
      // filter outcome, not a cache problem, and NOT a reason to prune a like
      // (the artwork still exists). Answered from cache, no refetch.
      return { artwork: null, status: 'invalid', fromCache: true };
    }
    // Missing or mismatched objectID — the entry is corrupt (not the object
    // this key names). Evict it and fall through to a fresh fetch rather than
    // blackholing the ID.
    await removeCachedArtwork(objectID);
  }

  // 2. In-flight dedup + throttled fetch (via requestManager.fetchDeduped)
  const url = `${API_BASE_URL}/objects/${objectID}`;
  try {
    const response = await requestManager.fetchDeduped(url, signal);
    if (response.status === 404) return { artwork: null, status: 'notFound' };
    if (!response.ok) return { artwork: null, status: 'error' };
    let artwork;
    try {
      // fetchDeduped shares ONE Response across concurrent same-URL callers,
      // so each caller must read its OWN clone — reading the raw body would
      // throw "body stream already read" for every caller after the first.
      // (?. keeps unit-test doubles without .clone() working.)
      artwork = await (response.clone?.() ?? response).json();
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (err instanceof SyntaxError) {
        // 200-status Imperva block page (HTML body) — definitive ban evidence
        // the status-based accounting in requestManager.fetch can't see; trips
        // the breaker immediately (see reportBlockPage). ONLY SyntaxError
        // qualifies: a body-stream TypeError is a local read problem, and
        // treating it as a ban put the app into a spurious 60s dead feed.
        requestManager.reportBlockPage();
      }
      return { artwork: null, status: 'error' };
    }
    // Cache every real API object — including validation rejects. A rejected
    // object (no open-access image, filtered medium) used to be refetched by
    // every scan window that revisited its id (measured ~12 requests per
    // rendered feed card); cached, the reject costs zero network, and the
    // non-strict grid can reuse objects the strict feed rejected.
    if (isRealApiObject(artwork, objectID)) {
      if (validateArtwork(artwork)) {
        // Baseline-valid: store whole (a non-strict caller can display it).
        await setCachedArtwork(objectID, artwork);
      } else {
        // Baseline-invalid: store a minimal tombstone (nothing can display it,
        // and rejects are the majority of fetches — full payloads would bloat
        // IndexedDB severalfold) on the short self-healing TTL.
        const { objectID: id, primaryImage, title, objectName } = artwork;
        await setCachedArtwork(objectID, { objectID: id, primaryImage, title, objectName }, TTL_INVALID_ARTWORK_MS);
      }
    }
    // No fromCache flag on network-path results — the flag is set (true) only
    // on cache hits; consumers treat its absence as "the network was touched".
    if (validateArtwork(artwork, { strict })) return { artwork, status: 'used' };
    return { artwork: null, status: 'invalid' };
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error.message === CIRCUIT_BREAKER_OPEN) throw error;
    return { artwork: null, status: 'error' };
  }
}

// Thin wrapper for callers that only want the artwork (e.g. deep-link resolution)
export async function fetchArtworkByID(objectID, signal = null, opts = {}) {
  const { artwork } = await fetchArtworkWithStatus(objectID, signal, opts);
  return artwork;
}

// Batch fetch with parallel requests — uses requestManager.maxConcurrent for dynamic sizing.
//
// Returns { artworks, outcomes, consumedCount }:
//   artworks      — up to targetCount valid artworks (in order)
//   outcomes      — Map<objectID, status> for EVERY id attempted (lets /liked prune 404s)
//   consumedCount — how many entries of objectIDs the caller should advance past: the
//                   index just after the id that produced the LAST returned artwork.
//                   Ids beyond this point were either over-fetched-and-discarded or never
//                   attempted, so they must remain visitable — advancing by a raw count
//                   would silently skip them (the bug this contract fixes).
//
// onArtwork(artwork, idIndex) — optional progressive-render hook. Fired for
// EXACTLY the artworks the call will return, in return order, as soon as each
// is knowable: artwork k emits once ids 0..k have all settled (in-order gating,
// so the feed never reorders or leaves holes). idIndex is the artwork's
// position in objectIDs, letting the caller map back to its own indices.
// Measured wave spread is 157-340ms — that's how much sooner the first card
// paints versus waiting for the whole batch (scripts/API-FINDINGS.md).
export async function batchFetchArtworks(objectIDs, targetCount = 4, signal = null, { strict = false, onArtwork = null } = {}) {
  const artworks = [];
  const outcomeList = []; // ordered [{ id, status }], processing order === objectIDs order
  let idIndex = 0;
  // Once the batch is failing (abort/breaker rejection in flight), stop
  // emitting: a late-settling sibling promise must not announce cards after
  // the caller's catch block has started reasoning about what was emitted.
  let stopEmitting = false;

  while (artworks.length < targetCount && idIndex < objectIDs.length) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Batch size: 2x what we need, capped at current dynamic concurrency limit
    const remaining = targetCount - artworks.length;
    const batchSize = Math.min(
      requestManager.maxConcurrent,
      Math.max(remaining * 2, 4),
      objectIDs.length - idIndex
    );

    const batchIDs = objectIDs.slice(idIndex, idIndex + batchSize);
    const baseIndex = idIndex; // absolute position of batchIDs[0] in objectIDs
    idIndex += batchSize;

    // Parallel fetch with an in-order drain: each settled result lands in its
    // slot, then the drain walks forward over the contiguous settled prefix,
    // recording outcomes and emitting kept artworks. Out-of-order arrivals
    // just wait in their slot until their predecessors settle.
    const results = new Array(batchIDs.length);
    let drained = 0;
    const drain = () => {
      while (drained < results.length && results[drained] !== undefined) {
        const r = results[drained];
        outcomeList.push({ id: batchIDs[drained], status: r.status });
        if (r.artwork) {
          artworks.push(r.artwork);
          if (artworks.length <= targetCount && !stopEmitting) {
            // A throwing consumer must not read as a batch failure
            try { onArtwork?.(r.artwork, baseIndex + drained); }
            catch (e) { console.warn('[metAPI] onArtwork error:', e.message); }
          }
        }
        drained++;
      }
    };

    try {
      await Promise.all(
        batchIDs.map((id, k) =>
          fetchArtworkWithStatus(id, signal, { strict })
            .catch(err => {
              if (err.name === 'AbortError') throw err;
              if (err.message === CIRCUIT_BREAKER_OPEN) throw err;
              return { artwork: null, status: 'error' };
            })
            .then(res => { results[k] = res; drain(); })
        )
      );
    } catch (err) {
      stopEmitting = true;
      throw err;
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Cooldown between batches — abort-aware, uses dynamic batchCooldownMs.
    // Skipped when the whole sub-batch was answered from cache: the cooldown
    // protects the network budget, which cache hits never touch, and warm
    // negative-cached regions would otherwise pay 80ms+ of dead time per
    // window while scanning past known rejects.
    if (artworks.length < targetCount && idIndex < objectIDs.length) {
      const allFromCache = results.every(r => r?.fromCache);
      if (!allFromCache) await delayOrAbort(requestManager.batchCooldownMs, signal);
    }
  }

  // consumedCount = position just after the id that produced the LAST kept artwork.
  const kept = Math.min(artworks.length, targetCount);
  let usedSeen = 0;
  let consumedCount = outcomeList.length;
  for (let k = 0; k < outcomeList.length; k++) {
    if (outcomeList[k].status === 'used') {
      usedSeen++;
      if (usedSeen === kept) { consumedCount = k + 1; break; }
    }
  }

  return {
    artworks: artworks.slice(0, targetCount),
    outcomes: new Map(outcomeList.map(o => [o.id, o.status])),
    consumedCount,
  };
}

export { API_BASE_URL };
