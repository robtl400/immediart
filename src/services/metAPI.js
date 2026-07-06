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

// Fetch with retry and rate limit handling — delegates throttle to requestManager
async function fetchWithRetry(url, signal = null) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const response = await requestManager.fetch(url, signal);
      if (response.status === 403 && i < MAX_RETRIES - 1) {
        await delayOrAbort(addJitter(RATE_LIMIT_DELAYS[i] || RATE_LIMIT_DELAYS.at(-1)), signal);
        continue;
      }
      return response;
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
  const params = new URLSearchParams({ hasImages: 'true', q: query });
  if (artistMode) params.set('artistOrCulture', 'true');
  if (medium) params.set('medium', medium);
  const url = `${API_BASE_URL}/search?${params}`;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const response = await fetchWithRetry(url, signal);
  if (response.ok) {
    const data = await response.json();
    return data.objectIDs || [];
  }
  throw new Error(`Search failed: ${response.status}`);
}

// Convenience wrappers — cache result in IndexedDB with named keys
export async function fetchAllObjectIDs(signal) {
  const cached = await getCachedIDs('ids:feed:paintings-v2');
  if (cached) return cached;
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

// Fetch single artwork (with cache + in-flight dedup via requestManager)
export async function fetchArtworkByID(objectID, signal = null, { strict = false } = {}) {
  // 1. Cache check — re-validate on read: the cache is shared between strict (feed)
  // and non-strict (grid) callers, so a hit written by one must still pass the
  // caller's own strictness before being returned.
  const cached = await getCachedArtwork(objectID);
  if (cached) {
    if (validateArtwork(cached, { strict })) return cached;
    // Passes baseline but not the caller's strictness (e.g. feed reading a
    // grid-cached print) — a correct filter, not a cache problem.
    if (validateArtwork(cached)) return null;
    // Fails even baseline validation: the entry is corrupt. Evict it and
    // fall through to a fresh fetch rather than blackholing the ID forever.
    await removeCachedArtwork(objectID);
  }

  // 2. In-flight dedup + throttled fetch (via requestManager.fetchDeduped)
  const url = `${API_BASE_URL}/objects/${objectID}`;
  try {
    const response = await requestManager.fetchDeduped(url, signal);
    if (!response.ok) return null;
    const artwork = await response.json();
    const result = validateArtwork(artwork, { strict }) ? artwork : null;
    if (result) await setCachedArtwork(objectID, result);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error.message === CIRCUIT_BREAKER_OPEN) throw error;
    return null;
  }
}

// Batch fetch with parallel requests — uses requestManager.maxConcurrent for dynamic sizing
export async function batchFetchArtworks(objectIDs, targetCount = 4, signal = null, { strict = false } = {}) {
  const artworks = [];
  let idIndex = 0;

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
    idIndex += batchSize;

    // Parallel fetch — propagate AbortError, swallow everything else
    const results = await Promise.all(
      batchIDs.map(id => fetchArtworkByID(id, signal, { strict }).catch(err => {
        if (err.name === 'AbortError') throw err;
        if (err.message === CIRCUIT_BREAKER_OPEN) throw err;
        return null;
      }))
    );
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    artworks.push(...results.filter(Boolean));

    // Cooldown between batches — abort-aware, uses dynamic batchCooldownMs
    if (artworks.length < targetCount && idIndex < objectIDs.length) {
      await delayOrAbort(requestManager.batchCooldownMs, signal);
    }
  }

  return artworks.slice(0, targetCount);
}

export { API_BASE_URL };
