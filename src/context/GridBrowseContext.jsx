/**
 * Grid Browse Context
 * Manages state for the grid-based browsing view (artist/tag search)
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { searchByArtist, searchByTag, batchFetchArtworks } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';

const GridBrowseContext = createContext(null);

const BATCH_SIZE = 3; // Load 3 thumbnails at a time to avoid API rate limits
const SEARCH_COOLDOWN_MS = 300; // Minimum time between searches

// Preload an image and return a promise (cancellable)
function preloadImage(url, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;

    // Cancel if aborted
    signal?.addEventListener('abort', () => resolve(false));
  });
}

export function GridBrowseProvider({ children }) {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchType, setSearchType] = useState(null); // 'artist' or 'tag'
  const [searchTerm, setSearchTerm] = useState('');

  // Refs for data that persists across renders
  const allIDsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const fetchingRef = useRef(false);
  const searchIdRef = useRef(0); // Track which search is current
  const lastSearchTimeRef = useRef(0); // Track last search time for cooldown
  const abortControllerRef = useRef(null); // AbortController for cancelling fetches

  // Reset state for a new search (does not touch fetchingRef)
  const resetState = useCallback(() => {
    setArtworks([]);
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setHasMore(true);
    allIDsRef.current = [];
    currentIndexRef.current = 0;
  }, []);

  // Initialize a new search
  const initSearch = useCallback(async (type, term) => {
    // Abort any in-flight requests from previous search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Increment search ID to invalidate any in-flight requests
    const currentSearchId = ++searchIdRef.current;

    // Check cooldown - wait if we searched too recently
    const now = Date.now();
    const timeSinceLastSearch = now - lastSearchTimeRef.current;
    if (timeSinceLastSearch < SEARCH_COOLDOWN_MS) {
      await new Promise(resolve => setTimeout(resolve, SEARCH_COOLDOWN_MS - timeSinceLastSearch));
    }
    lastSearchTimeRef.current = Date.now();

    // Reset everything for new search
    fetchingRef.current = true;
    resetState();
    setSearchType(type);
    setSearchTerm(term);
    setLoading(true);
    setError(null);

    try {
      // Fetch all matching IDs
      const searchFn = type === 'artist' ? searchByArtist : searchByTag;
      const allIDs = await searchFn(term, signal);

      // Check if this search is still current
      if (searchIdRef.current !== currentSearchId) return;

      allIDsRef.current = allIDs;

      if (allIDs.length === 0) {
        setHasMore(false);
        setLoading(false);
        fetchingRef.current = false;
        return;
      }

      // Fetch first batch - smaller initial load to avoid rate limits
      const idsToTry = allIDs.slice(0, BATCH_SIZE * 2);
      currentIndexRef.current = BATCH_SIZE * 2;

      const rawArtworks = await batchFetchArtworks(idsToTry, BATCH_SIZE, signal);

      // Check if this search is still current
      if (searchIdRef.current !== currentSearchId) return;

      const newArtworks = rawArtworks.map(transformAPIToDisplay);

      // Preload images before showing (also cancellable)
      await Promise.all(newArtworks.map(a => preloadImage(a.imageUrl, signal)));

      // Final check before updating state
      if (searchIdRef.current !== currentSearchId) return;

      setArtworks(newArtworks);
      setHasMore(currentIndexRef.current < allIDsRef.current.length);
      setError(null);
    } catch (err) {
      // Ignore abort errors (user navigated away)
      if (err.name === 'AbortError') return;
      // Only set error if this search is still current
      if (searchIdRef.current === currentSearchId) {
        setError(err.message);
      }
    } finally {
      if (searchIdRef.current === currentSearchId) {
        setLoading(false);
        fetchingRef.current = false;
      }
    }
  }, [resetState]);

  // Load more artworks for infinite scroll
  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);

    // Use current abort controller (may be aborted if user navigates away)
    const signal = abortControllerRef.current?.signal;

    try {
      const startIndex = currentIndexRef.current;
      const idsToTry = allIDsRef.current.slice(startIndex, startIndex + BATCH_SIZE * 2);
      currentIndexRef.current = startIndex + BATCH_SIZE * 2;

      if (idsToTry.length === 0) {
        setHasMore(false);
        return;
      }

      const rawArtworks = await batchFetchArtworks(idsToTry, BATCH_SIZE, signal);
      const newArtworks = rawArtworks.map(transformAPIToDisplay);

      // Preload images
      await Promise.all(newArtworks.map(a => preloadImage(a.imageUrl, signal)));

      setArtworks(prev => [...prev, ...newArtworks]);
      setHasMore(currentIndexRef.current < allIDsRef.current.length);
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [hasMore]);

  const value = {
    artworks,
    loading,
    loadingMore,
    error,
    hasMore,
    searchType,
    searchTerm,
    totalCount: allIDsRef.current.length,
    initSearch,
    loadMore,
    resetState
  };

  return (
    <GridBrowseContext.Provider value={value}>
      {children}
    </GridBrowseContext.Provider>
  );
}

export function useGridBrowse() {
  const context = useContext(GridBrowseContext);
  if (!context) {
    throw new Error('useGridBrowse must be used within a GridBrowseProvider');
  }
  return context;
}
