/**
 * Artworks Context - Discovery feed state management
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllObjectIDs, batchFetchArtworks, shuffleArray } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';
import { preloadArtworkImages } from '../utils/imageLoader';
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
        const allIDs = await fetchAllObjectIDs(signal);
        if (fetchIdRef.current !== currentFetchId) return;
        allIDsRef.current = shuffleArray(allIDs);
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

      // Preload images on initial load (pass signal to allow abort)
      if (isInitial) await preloadArtworkImages(newArtworks, signal);
      if (fetchIdRef.current !== currentFetchId) return;

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
  }, []);

  // Initialize on mount
  useEffect(() => {
    fetchArtworks(true);
  }, [fetchArtworks]);

  // Public API
  const loadMoreArtworks = useCallback(() => {
    if (!fetchingRef.current && hasMore && !loadingMore) fetchArtworks(false);
  }, [fetchArtworks, hasMore, loadingMore]);

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
    setArtworks([]);
    setHasMore(true);
    setError(null);
    setLoading(true);
    allIDsRef.current = [];
    currentIndexRef.current = 0;
    shownIDsRef.current = new Set();
    fetchingRef.current = false;
    // Wait for rate limit recovery after aborting previous requests
    await new Promise(r => setTimeout(r, RATE_LIMIT_RECOVERY_MS));
    fetchArtworks(true);
  }, [fetchArtworks]);

  // Pause fetching (for navigation away)
  const pause = useCallback(() => {
    abortControllerRef.current?.abort();
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
