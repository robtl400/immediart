/**
 * usePaginatedFetch — shared pagination hook for ArtworksContext and GridBrowseContext.
 *
 * Extracts the ~85% identical batch/prefetch/abort logic that was duplicated
 * across both contexts. Each context configures divergent behaviour via options.
 *
 * Options:
 *   shuffleIDs   {boolean}  — shuffle IDs and use shownIDsRef dedup (feed: true, grid: false)
 *   batchSize    {number}   — artworks per batch (FEED_BATCH_SIZE | GRID_BATCH_SIZE)
 *   maxInMemory  {number}   — trim artworks state to last N (feed: 30, grid: Infinity)
 *   onBatchReady {function} — (artworks[], signal) => void — fires after each setArtworks;
 *                             errors are swallowed, hook continues regardless
 *
 * fetchIDs is NOT a constructor param. Install it via reset(newFetchIDs).
 * This allows GridBrowseContext to change search terms without re-mounting the hook.
 *
 * Public API:
 *   artworks, loading, loadingMore, error, hasMore
 *   loadMore()              — instant merge from a ready prefetch, join an
 *                             in-flight prefetch, or fetch the next batch
 *   reset(newFetchIDs)      — abort + install new fetchIDs fn + start fresh
 *   pause()                 — abort all in-flight work without resetting state
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { batchFetchArtworks } from '../services/metAPI';
import { CIRCUIT_BREAKER_OPEN } from '../services/requestManager';
import { shuffleArray } from '../utils/shuffle';
import { transformAPIToDisplay } from '../utils/transformers';
import { delayOrAbort } from '../utils/delay';
import { RATE_LIMIT_RECOVERY_MS } from '../utils/constants';

const LOAD_ERROR = "Couldn't load more art. Tap to retry.";
const OFFLINE_ERROR = "You appear to be offline. Reconnect and tap to retry.";

// Surface an offline-specific message when the browser reports no connection,
// so a network drop reads as "you're offline" rather than a generic failure.
const loadError = () =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) ? OFFLINE_ERROR : LOAD_ERROR;

export function usePaginatedFetch({
  shuffleIDs       = false,
  batchSize,
  initialBatchSize = null, // smaller first batch so first artworks appear sooner; defaults to batchSize
  maxInMemory      = Infinity,
  onBatchReady     = null,
  strictValidation = false, // true = apply OBJECT_TYPES filter (feed only); false = accept all media types
}) {
  // ── State ────────────────────────────────────────────────────────────────
  const [artworks,    setArtworks]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(null);
  const [hasMore,     setHasMore]     = useState(true);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const allIDsRef            = useRef([]);
  const currentIndexRef      = useRef(0);
  const shownIDsRef          = useRef(new Set());     // only used when shuffleIDs=true
  const seedIDsRef           = useRef(new Set());     // IDs already shown via seed — skip in fetch
  const hasSeedRef           = useRef(false);         // true when reset() was called with seed artworks
  const fetchingRef          = useRef(false);
  const abortControllerRef   = useRef(null);
  const fetchIdRef           = useRef(0);

  // fetchIDs function — updated via reset(); always read via ref so fetchBatch
  // can be stable (no dep on fetchIDs function identity)
  const fetchIDsRef          = useRef(null);

  // onBatchReady in a ref so the hook's callbacks are stable regardless of
  // whether the caller redefines the function each render
  const onBatchReadyRef      = useRef(onBatchReady);
  useEffect(() => { onBatchReadyRef.current = onBatchReady; }, [onBatchReady]);

  // Prefetch state
  const prefetchRef          = useRef(null);   // { artworks, nextIndex, outcomes } | null
  const prefetchControllerRef = useRef(null);  // AbortController for background prefetch
  const prefetchPromiseRef   = useRef(null);   // settles when the in-flight prefetch does (never rejects)

  // ── collectCandidates ──────────────────────────────────────────────────────
  //
  // Scan allIDsRef from `fromIndex`, skipping seed IDs (and, when shuffling,
  // already-shown IDs), until `limit` usable IDs are collected or the array is
  // exhausted. Returns the IDs alongside srcIdx — their positions in allIDsRef —
  // so the caller can advance currentIndexRef to just past the LAST id that
  // produced a kept artwork, rather than a raw count (a filtered/over-fetched
  // count doesn't map linearly to allIDsRef and would skip unattempted IDs).

  const collectCandidates = useCallback((fromIndex, limit) => {
    const all = allIDsRef.current;
    const ids = [];
    const srcIdx = [];
    let i = fromIndex;
    while (ids.length < limit && i < all.length) {
      const id = all[i];
      const seedSkip  = seedIDsRef.current.has(String(id));
      const shownSkip = shuffleIDs && shownIDsRef.current.has(id);
      if (!seedSkip && !shownSkip) { ids.push(id); srcIdx.push(i); }
      i++;
    }
    return { ids, srcIdx };
  }, [shuffleIDs]);

  // ── startPrefetch ─────────────────────────────────────────────────────────

  const startPrefetch = useCallback((fromIndex) => {
    prefetchControllerRef.current?.abort();
    prefetchRef.current = null;
    prefetchPromiseRef.current = null;
    prefetchControllerRef.current = new AbortController();
    const signal = prefetchControllerRef.current.signal;

    const limit = batchSize * (shuffleIDs ? 3 : 2);
    const { ids, srcIdx } = collectCandidates(fromIndex, limit);
    if (ids.length === 0) return;

    // The promise is kept so loadMore can JOIN an in-flight prefetch instead of
    // racing it with a duplicate batch. It always resolves (never rejects).
    prefetchPromiseRef.current = batchFetchArtworks(ids, batchSize, signal, { strict: strictValidation })
      .then(({ artworks: raw, outcomes, consumedCount }) => {
        if (signal.aborted) return;
        const nextIndex = consumedCount > 0 ? srcIdx[consumedCount - 1] + 1 : fromIndex;
        prefetchRef.current = { artworks: raw.map(transformAPIToDisplay), nextIndex, outcomes };
      })
      .catch(() => {}); // prefetch failure is non-fatal
  }, [shuffleIDs, batchSize, strictValidation, collectCandidates]);

  // ── fetchBatch ────────────────────────────────────────────────────────────
  //
  // Core fetch loop. isInitial=true: fetch IDs via fetchIDsRef, then first batch.
  // isInitial=false: load next batch from existing allIDsRef position.
  //
  // Phase 4 — Error state elimination:
  //   On first failure: log + auto-retry once after RATE_LIMIT_RECOVERY_MS.
  //   On retry failure: show user-friendly "Couldn't load more art" message.
  //   Raw API error messages are never surfaced to the user.

  const fetchBatch = useCallback(async (isInitial = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const currentFetchId = ++fetchIdRef.current;

    // IDs we attempt in this batch + their allIDsRef positions — declared here
    // so the catch block can retry the SAME window and derive the resume index.
    let idsToTry = [];
    let idsSrcIdx = [];

    // Use smaller initial batch so first artworks appear sooner
    const targetCount = isInitial && initialBatchSize != null ? initialBatchSize : batchSize;

    // ── Progressive render ─────────────────────────────────────────────────
    // Cards are appended to state the moment batchFetchArtworks emits them
    // (in order), instead of waiting for the whole batch. `streamed` mirrors
    // exactly what was appended so (a) the post-await code doesn't re-add,
    // (b) a mid-batch failure can retry ONLY the un-kept ids, and (c)
    // onBatchReady still receives the full batch it always did.
    const streamed        = [];        // transformed artworks already in state
    const streamedIdSet   = new Set(); // their raw ids — excluded from retry
    let lastStreamedSrcIdx = -1;       // allIDsRef position of the last emission

    const appendArtwork = (display) => {
      setArtworks(prev => {
        const combined = [...prev, display];
        return isFinite(maxInMemory) && combined.length > maxInMemory
          ? combined.slice(-maxInMemory)
          : combined;
      });
    };

    const onArtwork = (raw, idIdx) => {
      if (signal.aborted || fetchIdRef.current !== currentFetchId) return;
      const display = transformAPIToDisplay(raw);
      streamed.push(display);
      streamedIdSet.add(display.id);
      lastStreamedSrcIdx = idsSrcIdx[idIdx];
      if (shuffleIDs) shownIDsRef.current.add(display.id);
      appendArtwork(display);
    };

    try {
      if (isInitial) {
        // Skip the full-screen skeleton when seed artworks are already visible
        if (hasSeedRef.current) setLoadingMore(true);
        else setLoading(true);

        // Fetch IDs via the installed fetchIDs function (includes any delays)
        const allIDs = await fetchIDsRef.current(signal);
        if (fetchIdRef.current !== currentFetchId) return;

        allIDsRef.current   = shuffleIDs ? shuffleArray(allIDs) : allIDs;
        currentIndexRef.current = 0;
        if (shuffleIDs) shownIDsRef.current = new Set();
      } else {
        setLoadingMore(true);
      }

      // Collect candidate IDs WITHOUT advancing currentIndexRef — the position
      // only moves after a successful fetch, so an error leaves this window
      // intact for retryLoadMore to re-attempt.
      const start = currentIndexRef.current;
      const limit = targetCount * (shuffleIDs ? 3 : 2);
      ({ ids: idsToTry, srcIdx: idsSrcIdx } = collectCandidates(start, limit));

      if (idsToTry.length === 0) {
        setHasMore(false);
        return;
      }

      const { artworks: rawArtworks, outcomes, consumedCount } =
        await batchFetchArtworks(idsToTry, targetCount, signal, { strict: strictValidation, onArtwork });
      if (fetchIdRef.current !== currentFetchId) return;

      // Advance past the id that produced the LAST kept artwork; over-fetched or
      // unattempted candidates stay visitable next round.
      currentIndexRef.current = consumedCount > 0 ? idsSrcIdx[consumedCount - 1] + 1 : start;

      // Every returned artwork was normally already appended (and
      // shownIDs-recorded) by onArtwork as it emitted. The filter is a safety
      // net for any source that returns without emitting — those artworks are
      // appended now, in batch order, exactly like the pre-streaming behavior.
      const missed = rawArtworks
        .filter(a => !streamedIdSet.has(a.objectID))
        .map(transformAPIToDisplay);
      if (missed.length > 0) {
        if (shuffleIDs) missed.forEach(a => shownIDsRef.current.add(a.id));
        setArtworks(prev => {
          const combined = [...prev, ...missed];
          return isFinite(maxInMemory) && combined.length > maxInMemory
            ? combined.slice(-maxInMemory)
            : combined;
        });
      }
      const newArtworks = [...streamed, ...missed];

      setHasMore(currentIndexRef.current < allIDsRef.current.length);
      setError(null);

      if (onBatchReadyRef.current) {
        try { await onBatchReadyRef.current(newArtworks, signal, outcomes); }
        catch (e) { console.warn('[ImmediArt] onBatchReady error:', e.message); }
      }

      // Always start (or restart) the prefetch so a stale in-flight prefetch
      // can't write duplicate IDs into prefetchRef after fetchBatch(false) has
      // already added those same IDs to shownIDsRef and the artworks list.
      startPrefetch(currentIndexRef.current);

    } catch (err) {
      // Staleness FIRST: a superseded fetch (reset() started a new one and
      // cleared state) must not touch the cursor — its streamed cards are no
      // longer on screen.
      if (fetchIdRef.current !== currentFetchId) return;

      // Whatever the failure mode (including pause()-aborts, where cards stay
      // in state), streamed cards remain on screen — their ids must never be
      // revisited (grids have no shownIDs dedup, so a re-fetch of the same
      // window would render duplicate cards). In-order emission guarantees
      // everything before lastStreamedSrcIdx settled.
      if (lastStreamedSrcIdx >= 0) {
        currentIndexRef.current = Math.max(currentIndexRef.current, lastStreamedSrcIdx + 1);
      }
      if (err.name === 'AbortError') return;

      // Breaker open = the API is known-unhealthy; retrying immediately would
      // just hit the open breaker again. Surface the retry affordance instead
      // of dying silently (the feed would otherwise stall with no error UI).
      if (err.message === CIRCUIT_BREAKER_OPEN) {
        setError(loadError());
        return;
      }

      // Auto-retry once — never surface raw error messages
      console.warn('[ImmediArt] Fetch error (will retry):', err.message);

      try {
        await delayOrAbort(RATE_LIMIT_RECOVERY_MS, signal);
        if (signal.aborted || fetchIdRef.current !== currentFetchId) return;

        // Only retry if we have IDs from the batch phase (not a fetchIDs failure)
        if (idsToTry.length === 0) {
          setError(loadError());
          return;
        }

        // Cards streamed before the failure are already on screen and stay
        // there. Retry ONLY the ids that were never kept, for the remaining
        // target — re-running the full window would duplicate streamed cards.
        const retryIds = [];
        const retrySrc = [];
        for (let k = 0; k < idsToTry.length; k++) {
          if (!streamedIdSet.has(idsToTry[k])) {
            retryIds.push(idsToTry[k]);
            retrySrc.push(idsSrcIdx[k]);
          }
        }
        const retryTarget = targetCount - streamed.length;

        let retryOutcomes = new Map();
        let retryConsumedSrc = -1; // allIDsRef position after the last retry-kept id
        if (retryTarget > 0 && retryIds.length > 0) {
          const { artworks: retryRaw, outcomes, consumedCount: retryConsumed } =
            await batchFetchArtworks(retryIds, retryTarget, signal, { strict: strictValidation, onArtwork: (raw, idIdx) => {
              // Map emission indices through the FILTERED list's src positions
              if (signal.aborted || fetchIdRef.current !== currentFetchId) return;
              const display = transformAPIToDisplay(raw);
              streamed.push(display);
              streamedIdSet.add(display.id);
              lastStreamedSrcIdx = Math.max(lastStreamedSrcIdx, retrySrc[idIdx]);
              if (shuffleIDs) shownIDsRef.current.add(display.id);
              appendArtwork(display);
            } });
          if (fetchIdRef.current !== currentFetchId) return;
          retryOutcomes = outcomes;
          if (retryConsumed > 0) retryConsumedSrc = retrySrc[retryConsumed - 1];

          // Same returned-but-not-streamed safety net as the primary path
          const retryMissed = retryRaw
            .filter(a => !streamedIdSet.has(a.objectID))
            .map(transformAPIToDisplay);
          if (retryMissed.length > 0) {
            if (shuffleIDs) retryMissed.forEach(a => shownIDsRef.current.add(a.id));
            streamed.push(...retryMissed);
            setArtworks(prev => {
              const combined = [...prev, ...retryMissed];
              return isFinite(maxInMemory) && combined.length > maxInMemory
                ? combined.slice(-maxInMemory)
                : combined;
            });
          }
        }

        // Advance past the last kept artwork across BOTH attempts. Ids between
        // kept ones were attempted (in-order emission guarantees every id
        // before an emission settled) — same skip semantics as consumedCount.
        currentIndexRef.current = Math.max(
          currentIndexRef.current,
          retryConsumedSrc + 1,
          lastStreamedSrcIdx + 1
        );

        setHasMore(currentIndexRef.current < allIDsRef.current.length);
        setError(null);

        // Always fires (even with zero cards): /liked's prune reads outcomes
        // regardless of how many artworks the retry kept.
        if (onBatchReadyRef.current) {
          try { await onBatchReadyRef.current(streamed, signal, retryOutcomes); }
          catch (e) { console.warn('[ImmediArt] onBatchReady error:', e.message); }
        }

        startPrefetch(currentIndexRef.current);

      } catch (retryErr) {
        // Same never-revisit rule for cards the RETRY streamed before failing
        if (lastStreamedSrcIdx >= 0) {
          currentIndexRef.current = Math.max(currentIndexRef.current, lastStreamedSrcIdx + 1);
        }
        if (retryErr.name !== 'AbortError' && fetchIdRef.current === currentFetchId) {
          setError(loadError());
        }
      }

    } finally {
      if (fetchIdRef.current === currentFetchId) {
        setLoading(false);
        setLoadingMore(false);
        fetchingRef.current = false;
      }
    }
  }, [shuffleIDs, batchSize, initialBatchSize, maxInMemory, strictValidation, startPrefetch, collectCandidates]);

  // ── loadMore ──────────────────────────────────────────────────────────────

  // Instant merge of a completed prefetch into state. Caller must have checked
  // prefetchRef.current is set.
  const mergePrefetch = useCallback(() => {
    const { artworks: prefetched, nextIndex, outcomes } = prefetchRef.current;
    prefetchRef.current = null;
    if (shuffleIDs) prefetched.forEach(a => shownIDsRef.current.add(a.id));
    currentIndexRef.current = nextIndex;
    setArtworks(prev => {
      const combined = [...prev, ...prefetched];
      return isFinite(maxInMemory) && combined.length > maxInMemory
        ? combined.slice(-maxInMemory)
        : combined;
    });
    setHasMore(nextIndex < allIDsRef.current.length);

    // Prefetch-merged batches get the same onBatchReady treatment as
    // fetched ones (e.g. the grid's image warm-up, /liked's 404 prune).
    if (onBatchReadyRef.current) {
      Promise.resolve(onBatchReadyRef.current(prefetched, undefined, outcomes))
        .catch(e => console.warn('[ImmediArt] onBatchReady error:', e.message));
    }

    startPrefetch(nextIndex);
  }, [shuffleIDs, maxInMemory, startPrefetch]);

  const loadMore = useCallback(() => {
    // `error` gates the sentinel-driven loop: while an error is showing, the
    // IntersectionObserver would otherwise re-fire fetchBatch continuously
    // against a known-unhealthy API. Recovery goes through retryLoadMore.
    if (fetchingRef.current || !hasMore || loadingMore || error) return;

    // Instant merge from prefetch if ready
    if (prefetchRef.current) {
      mergePrefetch();
      return;
    }

    // A prefetch is in flight (or settled empty-handed): JOIN it rather than
    // racing it with fetchBatch(false) — the old fallthrough started a full
    // batch whose completion aborted the prefetch, throwing away its requests
    // and refetching the same ids later. Under fast scrolling that happened on
    // nearly every batch and burned the request budget ~2x faster.
    if (prefetchPromiseRef.current) {
      const signal = prefetchControllerRef.current?.signal;
      const joinId = fetchIdRef.current;
      fetchingRef.current = true; // gate re-entry while waiting
      setLoadingMore(true);
      prefetchPromiseRef.current.then(() => {
        // A reset() during the join started a new fetch that owns the flags now.
        if (fetchIdRef.current !== joinId) return;
        fetchingRef.current = false;
        setLoadingMore(false);
        if (signal?.aborted) return; // pause() — flags cleared, nothing to merge
        if (prefetchRef.current) mergePrefetch();
        else fetchBatch(false); // prefetch came back empty/failed — fetch for real
      });
      return;
    }

    // Mirror retryLoadMore's empty-IDs guard: if the INITIAL fetch was aborted
    // before IDs loaded (navigate away during first load, then return — the
    // provider outlives the view and never re-runs its mount reset), a plain
    // fetchBatch(false) would see zero candidates, set hasMore=false, and
    // dead-end the feed with no cards, no error, and no retry affordance.
    fetchBatch(allIDsRef.current.length === 0);
  }, [fetchBatch, hasMore, loadingMore, error, mergePrefetch]);

  // ── retryLoadMore ─────────────────────────────────────────────────────────
  //
  // Manual recovery from a load-more error: clear the error (which re-enables
  // loadMore) and fetch again. If the FAILED call was the initial one (IDs
  // were never loaded — e.g. a seeded grid whose search threw), re-run the
  // initial phase; fetchBatch(false) against an empty ID list would set
  // hasMore=false and dead-end the view.

  const retryLoadMore = useCallback(() => {
    setError(null);
    fetchBatch(allIDsRef.current.length === 0);
  }, [fetchBatch]);

  // ── reset ─────────────────────────────────────────────────────────────────
  //
  // Abort all in-flight work, install a new fetchIDs function, start fresh.
  // Called synchronously — no awaiting so abort happens in the same tick.
  //
  // Race safety: abort fires first → in-flight fetchBatch exits via AbortError
  // → fetchIDsRef.current is updated after abort so in-flight code that
  //   reaches the AbortError check exits before reading the new ref value.

  const reset = useCallback((newFetchIDs, seedArtworks = []) => {
    abortControllerRef.current?.abort();
    prefetchControllerRef.current?.abort();
    fetchIDsRef.current  = newFetchIDs;
    prefetchRef.current  = null;
    prefetchPromiseRef.current = null;
    allIDsRef.current    = [];
    currentIndexRef.current = 0;
    if (shuffleIDs) shownIDsRef.current = new Set();
    hasSeedRef.current   = seedArtworks.length > 0;
    seedIDsRef.current   = new Set(seedArtworks.map(a => String(a.id)));
    fetchingRef.current  = false;
    setArtworks(seedArtworks);
    setError(null);
    setHasMore(true);
    fetchBatch(true);
  }, [shuffleIDs, fetchBatch]);

  // ── pause ─────────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    abortControllerRef.current?.abort();
    prefetchControllerRef.current?.abort();
    prefetchRef.current  = null;
    prefetchPromiseRef.current = null;
    fetchingRef.current  = false;
    // Clear loading flags directly: a joined prefetch's continuation may not
    // settle for a long time under budget pressure, and the provider outlives
    // the view — a stranded loadingMore=true would gate loadMore when the user
    // returns to the feed, dead-ending it on a snapped-to spinner.
    setLoading(false);
    setLoadingMore(false);
  }, []);

  return {
    artworks,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retryLoadMore,
    reset,
    pause,
  };
}
