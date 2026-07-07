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
  const prefetchRef          = useRef(null);   // { artworks, nextIndex } | null
  const prefetchControllerRef = useRef(null);  // AbortController for background prefetch

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
    prefetchControllerRef.current = new AbortController();
    const signal = prefetchControllerRef.current.signal;

    const limit = batchSize * (shuffleIDs ? 3 : 2);
    const { ids, srcIdx } = collectCandidates(fromIndex, limit);
    if (ids.length === 0) return;

    batchFetchArtworks(ids, batchSize, signal, { strict: strictValidation })
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
        await batchFetchArtworks(idsToTry, targetCount, signal, { strict: strictValidation });
      if (fetchIdRef.current !== currentFetchId) return;

      // Advance past the id that produced the LAST kept artwork; over-fetched or
      // unattempted candidates stay visitable next round.
      currentIndexRef.current = consumedCount > 0 ? idsSrcIdx[consumedCount - 1] + 1 : start;

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
        try { await onBatchReadyRef.current(newArtworks, signal, outcomes); }
        catch (e) { console.warn('[ImmediArt] onBatchReady error:', e.message); }
      }

      // Always start (or restart) the prefetch so a stale in-flight prefetch
      // can't write duplicate IDs into prefetchRef after fetchBatch(false) has
      // already added those same IDs to shownIDsRef and the artworks list.
      startPrefetch(currentIndexRef.current);

    } catch (err) {
      if (err.name === 'AbortError') return;
      if (fetchIdRef.current !== currentFetchId) return;

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

        const { artworks: retryRaw, outcomes: retryOutcomes, consumedCount: retryConsumed } =
          await batchFetchArtworks(idsToTry, targetCount, signal, { strict: strictValidation });
        if (fetchIdRef.current !== currentFetchId) return;

        currentIndexRef.current = retryConsumed > 0 ? idsSrcIdx[retryConsumed - 1] + 1 : currentIndexRef.current;

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
          try { await onBatchReadyRef.current(retryArtworks, signal, retryOutcomes); }
          catch (e) { console.warn('[ImmediArt] onBatchReady error:', e.message); }
        }

        startPrefetch(currentIndexRef.current);

      } catch (retryErr) {
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

  const loadMore = useCallback(() => {
    // `error` gates the sentinel-driven loop: while an error is showing, the
    // IntersectionObserver would otherwise re-fire fetchBatch continuously
    // against a known-unhealthy API. Recovery goes through retryLoadMore.
    if (fetchingRef.current || !hasMore || loadingMore || error) return;

    // Instant merge from prefetch if ready
    if (prefetchRef.current) {
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
      return;
    }

    fetchBatch(false);
  }, [fetchBatch, hasMore, loadingMore, error, shuffleIDs, maxInMemory, startPrefetch]);

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
    fetchingRef.current  = false;
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
