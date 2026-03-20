/**
 * Artworks Context - Discovery feed state management
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllObjectIDs, batchFetchArtworks, shuffleArray } from '../services/metAPI';
import { getCachedIDs, clearCache } from '../services/artworkCache';
import { transformAPIToDisplay } from '../utils/transformers';
import { FEED_BATCH_SIZE, MAX_ARTWORKS_IN_MEMORY, RATE_LIMIT_RECOVERY_MS } from '../utils/constants';

const ArtworksContext = createContext(null);

export function ArtworksProvider({ children }) {
  // State
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Refs for tracking fetch state
  const allIDsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const shownIDsRef = useRef(new Set());
  const fetchingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const fetchIdRef = useRef(0);

  // Prefetch state
  const prefetchRef = useRef(null);           // { artworks, nextIndex } | null
  const prefetchControllerRef = useRef(null); // AbortController for background prefetch

  // Start background prefetch for the next batch
  const startPrefetch = useCallback((fromIndex) => {
    prefetchControllerRef.current?.abort();
    prefetchRef.current = null;
    prefetchControllerRef.current = new AbortController();
    const signal = prefetchControllerRef.current.signal;

    const idsToTry = [];
    let i = fromIndex;
    while (idsToTry.length < FEED_BATCH_SIZE * 3 && i < allIDsRef.current.length) {
      const id = allIDsRef.current[i];
      if (!shownIDsRef.current.has(id)) idsToTry.push(id);
      i++;
    }
    const nextIndex = i;
    if (idsToTry.length === 0) return;

    batchFetchArtworks(idsToTry, FEED_BATCH_SIZE, signal)
      .then(raw => {
        if (signal.aborted) return;
        prefetchRef.current = { artworks: raw.map(transformAPIToDisplay), nextIndex };
      })
      .catch(() => {}); // prefetch failure is non-fatal
  }, []);

  // Fetch artworks (initial or load more)
  const fetchArtworks = useCallback(async (isInitial = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    // Cancel previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const currentFetchId = ++fetchIdRef.current;

    try {
      if (isInitial) {
        setLoading(true);

        // Check cache first — cache hit lets us skip the 300ms post-search pause
        const cachedIDs = await getCachedIDs('ids:feed:paintings');
        if (cachedIDs) {
          allIDsRef.current = shuffleArray(cachedIDs);
          // Skip 300ms pause — IDs from cache, no rate-limit concern
        } else {
          const allIDs = await fetchAllObjectIDs(signal); // internally caches on miss
          if (fetchIdRef.current !== currentFetchId) return;
          allIDsRef.current = shuffleArray(allIDs);
          // Brief pause after live search before fetching objects
          await new Promise(r => setTimeout(r, 300));
          if (signal.aborted) return;
        }

        currentIndexRef.current = 0;
        shownIDsRef.current = new Set();
      } else {
        setLoadingMore(true);
      }

      // Get next batch of unshown IDs
      const idsToTry = [];
      let i = currentIndexRef.current;
      while (idsToTry.length < FEED_BATCH_SIZE * 3 && i < allIDsRef.current.length) {
        const id = allIDsRef.current[i];
        if (!shownIDsRef.current.has(id)) idsToTry.push(id);
        i++;
      }
      currentIndexRef.current = i;

      if (idsToTry.length === 0) {
        setHasMore(false);
        return;
      }

      // Fetch and transform
      const rawArtworks = await batchFetchArtworks(idsToTry, FEED_BATCH_SIZE, signal);
      if (fetchIdRef.current !== currentFetchId) return;
      const newArtworks = rawArtworks.map(transformAPIToDisplay);

      // Track shown IDs and update state
      newArtworks.forEach(a => shownIDsRef.current.add(a.id));
      setArtworks(prev => {
        const combined = [...prev, ...newArtworks];
        return combined.length > MAX_ARTWORKS_IN_MEMORY
          ? combined.slice(-MAX_ARTWORKS_IN_MEMORY)
          : combined;
      });
      setHasMore(currentIndexRef.current < allIDsRef.current.length);
      setError(null);

      // After initial batch renders, start background prefetch of next batch
      if (isInitial) {
        startPrefetch(currentIndexRef.current);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (fetchIdRef.current === currentFetchId) setError(err.message);
    } finally {
      if (fetchIdRef.current === currentFetchId) {
        setLoading(false);
        setLoadingMore(false);
        fetchingRef.current = false;
      }
    }
  }, [startPrefetch]);

  // Initialize on mount
  useEffect(() => {
    fetchArtworks(true);
  }, [fetchArtworks]);

  // Public API
  const loadMoreArtworks = useCallback(() => {
    if (fetchingRef.current || !hasMore || loadingMore) return;

    // Use prefetched data if ready — instant merge, no network wait
    if (prefetchRef.current) {
      const { artworks: prefetched, nextIndex } = prefetchRef.current;
      prefetchRef.current = null;
      prefetched.forEach(a => shownIDsRef.current.add(a.id));
      currentIndexRef.current = nextIndex;
      setArtworks(prev => {
        const combined = [...prev, ...prefetched];
        return combined.length > MAX_ARTWORKS_IN_MEMORY
          ? combined.slice(-MAX_ARTWORKS_IN_MEMORY)
          : combined;
      });
      setHasMore(nextIndex < allIDsRef.current.length);
      // Start next prefetch immediately after merge
      startPrefetch(nextIndex);
      return;
    }

    fetchArtworks(false);
  }, [fetchArtworks, hasMore, loadingMore, startPrefetch]);

  const retry = useCallback(async () => {
    abortControllerRef.current?.abort();
    fetchingRef.current = false;
    setLoading(true);
    // Wait for rate limit recovery after aborting previous requests
    await new Promise(r => setTimeout(r, RATE_LIMIT_RECOVERY_MS));
    fetchArtworks(artworks.length === 0);
  }, [fetchArtworks, artworks.length]);

  const refresh = useCallback(async () => {
    abortControllerRef.current?.abort();
    prefetchControllerRef.current?.abort();
    prefetchRef.current = null;
    setArtworks([]);
    setHasMore(true);
    setError(null);
    setLoading(true);
    allIDsRef.current = [];
    currentIndexRef.current = 0;
    shownIDsRef.current = new Set();
    fetchingRef.current = false;
    // Evict cache so the next fetch pulls fresh data from the API
    await clearCache();
    // Wait for rate limit recovery after aborting previous requests
    await new Promise(r => setTimeout(r, RATE_LIMIT_RECOVERY_MS));
    fetchArtworks(true);
  }, [fetchArtworks]);

  // Pause fetching (for navigation away)
  const pause = useCallback(() => {
    abortControllerRef.current?.abort();
    prefetchControllerRef.current?.abort();
    prefetchRef.current = null;
    fetchingRef.current = false;
  }, []);

  const value = {
    artworks,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMoreArtworks,
    retry,
    refresh,
    pause
  };

  return (
    <ArtworksContext.Provider value={value}>
      {children}
    </ArtworksContext.Provider>
  );
}

export function useArtworks() {
  const context = useContext(ArtworksContext);
  if (!context) throw new Error('useArtworks must be used within ArtworksProvider');
  return context;
}
