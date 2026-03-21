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
 *   loadMore()              — instant merge from prefetch, or fetch next batch
 *   reset(newFetchIDs)      — abort + install new fetchIDs fn + start fresh
 *   pause()                 — abort all in-flight work without resetting state
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { batchFetchArtworks, shuffleArray } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';
import { delayOrAbort } from '../utils/delay';
import { RATE_LIMIT_RECOVERY_MS } from '../utils/constants';

export function usePaginatedFetch({
  shuffleIDs       = false,
  batchSize,
  initialBatchSize = null, // smaller first batch so first artworks appear sooner; defaults to batchSize
  maxInMemory      = Infinity,
  onBatchReady     = null,
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
  const prefetchRef          = useRef(null);   // { artworks, nextIndex } | null
  const prefetchControllerRef = useRef(null);  // AbortController for background prefetch

  // ── startPrefetch ─────────────────────────────────────────────────────────

  const startPrefetch = useCallback((fromIndex) => {
    prefetchControllerRef.current?.abort();
    prefetchRef.current = null;
    prefetchControllerRef.current = new AbortController();
    const signal = prefetchControllerRef.current.signal;

    let idsToTry;
    let nextIndex;

    if (shuffleIDs) {
      idsToTry = [];
      let i = fromIndex;
      while (idsToTry.length < batchSize * 3 && i < allIDsRef.current.length) {
        const id = allIDsRef.current[i];
        if (!shownIDsRef.current.has(id)) idsToTry.push(id);
        i++;
      }
      nextIndex = i;
    } else {
      idsToTry  = allIDsRef.current.slice(fromIndex, fromIndex + batchSize * 2);
      nextIndex = fromIndex + batchSize * 2;
    }

    if (idsToTry.length === 0) return;

    batchFetchArtworks(idsToTry, batchSize, signal)
      .then(raw => {
        if (signal.aborted) return;
        prefetchRef.current = { artworks: raw.map(transformAPIToDisplay), nextIndex };
      })
      .catch(() => {}); // prefetch failure is non-fatal
  }, [shuffleIDs, batchSize]);

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

    // IDs we attempt in this batch — declared here so the catch block can retry
    let idsToTry = [];

    // Use smaller initial batch so first artworks appear sooner
    const targetCount = isInitial && initialBatchSize != null ? initialBatchSize : batchSize;

    try {
      if (isInitial) {
        setLoading(true);

        // Fetch IDs via the installed fetchIDs function (includes any delays)
        const allIDs = await fetchIDsRef.current(signal);
        if (fetchIdRef.current !== currentFetchId) return;

        allIDsRef.current   = shuffleIDs ? shuffleArray(allIDs) : allIDs;
        currentIndexRef.current = 0;
        if (shuffleIDs) shownIDsRef.current = new Set();
      } else {
        setLoadingMore(true);
      }

      // Slice next batch of IDs
      if (shuffleIDs) {
        let i = currentIndexRef.current;
        while (idsToTry.length < targetCount * 3 && i < allIDsRef.current.length) {
          const id = allIDsRef.current[i];
          if (!shownIDsRef.current.has(id)) idsToTry.push(id);
          i++;
        }
        currentIndexRef.current = i;
      } else {
        const start = currentIndexRef.current;
        idsToTry = allIDsRef.current.slice(start, start + targetCount * 2);
        currentIndexRef.current = start + targetCount * 2;
      }

      if (idsToTry.length === 0) {
        setHasMore(false);
        return;
      }

      const rawArtworks = await batchFetchArtworks(idsToTry, targetCount, signal);
      if (fetchIdRef.current !== currentFetchId) return;

      const newArtworks = rawArtworks.map(transformAPIToDisplay);
      if (shuffleIDs) newArtworks.forEach(a => shownIDsRef.current.add(a.id));

      setArtworks(prev => {
        const combined = [...prev, ...newArtworks];
        return isFinite(maxInMemory) && combined.length > maxInMemory
          ? combined.slice(-maxInMemory)
          : combined;
      });
      setHasMore(currentIndexRef.current < allIDsRef.current.length);
      setError(null);

      if (onBatchReadyRef.current) {
        try { await onBatchReadyRef.current(newArtworks, signal); }
        catch (e) { console.warn('[ImmediArt] onBatchReady error:', e.message); }
      }

      if (isInitial) startPrefetch(currentIndexRef.current);

    } catch (err) {
      if (err.name === 'AbortError') return;
      if (fetchIdRef.current !== currentFetchId) return;

      // Auto-retry once — never surface raw error messages
      console.warn('[ImmediArt] Fetch error (will retry):', err.message);

      try {
        await delayOrAbort(RATE_LIMIT_RECOVERY_MS, signal);
        if (signal.aborted || fetchIdRef.current !== currentFetchId) return;

        // Only retry if we have IDs from the batch phase (not a fetchIDs failure)
        if (idsToTry.length === 0) {
          setError("Couldn't load more art. Tap to retry.");
          return;
        }

        const retryRaw = await batchFetchArtworks(idsToTry, targetCount, signal);
        if (fetchIdRef.current !== currentFetchId) return;

        const retryArtworks = retryRaw.map(transformAPIToDisplay);
        if (shuffleIDs) retryArtworks.forEach(a => shownIDsRef.current.add(a.id));

        setArtworks(prev => {
          const combined = [...prev, ...retryArtworks];
          return isFinite(maxInMemory) && combined.length > maxInMemory
            ? combined.slice(-maxInMemory)
            : combined;
        });
        setHasMore(currentIndexRef.current < allIDsRef.current.length);
        setError(null);

        if (onBatchReadyRef.current) {
          try { await onBatchReadyRef.current(retryArtworks, signal); }
          catch (e) { console.warn('[ImmediArt] onBatchReady error:', e.message); }
        }

        if (isInitial) startPrefetch(currentIndexRef.current);

      } catch (retryErr) {
        if (retryErr.name !== 'AbortError' && fetchIdRef.current === currentFetchId) {
          setError("Couldn't load more art. Tap to retry.");
        }
      }

    } finally {
      if (fetchIdRef.current === currentFetchId) {
        setLoading(false);
        setLoadingMore(false);
        fetchingRef.current = false;
      }
    }
  }, [shuffleIDs, batchSize, initialBatchSize, maxInMemory, startPrefetch]);

  // ── loadMore ──────────────────────────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore || loadingMore) return;

    // Instant merge from prefetch if ready
    if (prefetchRef.current) {
      const { artworks: prefetched, nextIndex } = prefetchRef.current;
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
      startPrefetch(nextIndex);
      return;
    }

    fetchBatch(false);
  }, [fetchBatch, hasMore, loadingMore, shuffleIDs, maxInMemory, startPrefetch]);

  // ── reset ─────────────────────────────────────────────────────────────────
  //
  // Abort all in-flight work, install a new fetchIDs function, start fresh.
  // Called synchronously — no awaiting so abort happens in the same tick.
  //
  // Race safety: abort fires first → in-flight fetchBatch exits via AbortError
  // → fetchIDsRef.current is updated after abort so in-flight code that
  //   reaches the AbortError check exits before reading the new ref value.

  const reset = useCallback((newFetchIDs) => {
    abortControllerRef.current?.abort();
    prefetchControllerRef.current?.abort();
    fetchIDsRef.current  = newFetchIDs;
    prefetchRef.current  = null;
    allIDsRef.current    = [];
    currentIndexRef.current = 0;
    if (shuffleIDs) shownIDsRef.current = new Set();
    fetchingRef.current  = false;
    setArtworks([]);
    setError(null);
    setHasMore(true);
    fetchBatch(true);
  }, [shuffleIDs, fetchBatch]);

  // ── pause ─────────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    abortControllerRef.current?.abort();
    prefetchControllerRef.current?.abort();
    prefetchRef.current  = null;
    fetchingRef.current  = false;
  }, []);

  return {
    artworks,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reset,
    pause,
  };
}
