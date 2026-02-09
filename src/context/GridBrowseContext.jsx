/**
 * Grid Browse Context - Search results state management
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { searchByArtist, searchByTag, batchFetchArtworks } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';
import { preloadArtworkImages } from '../utils/imageLoader';
import { GRID_BATCH_SIZE, SEARCH_COOLDOWN_MS, NAVIGATION_DELAY_MS } from '../utils/constants';

const GridBrowseContext = createContext(null);

export function GridBrowseProvider({ children }) {
  // State
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchType, setSearchType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Refs
  const allIDsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const fetchingRef = useRef(false);
  const searchIdRef = useRef(0);
  const lastSearchTimeRef = useRef(0);
  const abortControllerRef = useRef(null);

  // Reset state
  const resetState = useCallback(() => {
    setArtworks([]);
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setHasMore(true);
    allIDsRef.current = [];
    currentIndexRef.current = 0;
  }, []);

  // Initialize search
  const initSearch = useCallback(async (type, term) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const currentSearchId = ++searchIdRef.current;

    // Reset UI immediately
    fetchingRef.current = true;
    resetState();
    setSearchType(type);
    setSearchTerm(term);
    setLoading(true);

    // Wait for rate limit recovery after navigation
    await new Promise(r => setTimeout(r, NAVIGATION_DELAY_MS));
    if (signal.aborted) return;

    // Additional cooldown if searching again quickly
    const timeSince = Date.now() - lastSearchTimeRef.current;
    if (timeSince < SEARCH_COOLDOWN_MS) {
      await new Promise(r => setTimeout(r, SEARCH_COOLDOWN_MS - timeSince));
    }
    lastSearchTimeRef.current = Date.now();

    try {
      // Fetch matching IDs
      const searchFn = type === 'artist' ? searchByArtist : searchByTag;
      const allIDs = await searchFn(term, signal);
      if (searchIdRef.current !== currentSearchId) return;

      allIDsRef.current = allIDs;

      if (allIDs.length === 0) {
        setHasMore(false);
        setLoading(false);
        fetchingRef.current = false;
        return;
      }

      // Brief pause after search before fetching objects
      await new Promise(r => setTimeout(r, 300));
      if (signal.aborted) return;

      // Fetch first batch
      const idsToTry = allIDs.slice(0, GRID_BATCH_SIZE * 2);
      currentIndexRef.current = GRID_BATCH_SIZE * 2;

      const rawArtworks = await batchFetchArtworks(idsToTry, GRID_BATCH_SIZE, signal);
      if (searchIdRef.current !== currentSearchId) return;

      const newArtworks = rawArtworks.map(transformAPIToDisplay);
      // Don't await image preload - let browser lazy-load thumbnails
      preloadArtworkImages(newArtworks, signal);

      setArtworks(newArtworks);
      setHasMore(currentIndexRef.current < allIDsRef.current.length);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (searchIdRef.current === currentSearchId) setError(err.message);
    } finally {
      if (searchIdRef.current === currentSearchId) {
        setLoading(false);
        fetchingRef.current = false;
      }
    }
  }, [resetState]);

  // Load more for infinite scroll
  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore) return;
    // Ensure we have a valid abort controller
    if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) {
      abortControllerRef.current = new AbortController();
    }
    fetchingRef.current = true;
    setLoadingMore(true);

    const signal = abortControllerRef.current.signal;
    const currentSearchId = searchIdRef.current; // Capture current search ID

    try {
      const startIndex = currentIndexRef.current;
      const idsToTry = allIDsRef.current.slice(startIndex, startIndex + GRID_BATCH_SIZE * 2);
      currentIndexRef.current = startIndex + GRID_BATCH_SIZE * 2;

      if (idsToTry.length === 0) {
        setHasMore(false);
        return;
      }

      const rawArtworks = await batchFetchArtworks(idsToTry, GRID_BATCH_SIZE, signal);
      // Check if a new search started during fetch
      if (searchIdRef.current !== currentSearchId) return;

      const newArtworks = rawArtworks.map(transformAPIToDisplay);
      // Don't await image preload - let browser lazy-load thumbnails
      preloadArtworkImages(newArtworks, signal);

      setArtworks(prev => [...prev, ...newArtworks]);
      setHasMore(currentIndexRef.current < allIDsRef.current.length);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      // Only reset if this is still the current search
      if (searchIdRef.current === currentSearchId) {
        setLoadingMore(false);
        fetchingRef.current = false;
      }
    }
  }, [hasMore]);

  // Abort requests and reset loading states
  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    fetchingRef.current = false;
    setLoading(false);
    setLoadingMore(false);
  }, []);

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
    resetState,
    abort
  };

  return (
    <GridBrowseContext.Provider value={value}>
      {children}
    </GridBrowseContext.Provider>
  );
}

export function useGridBrowse() {
  const context = useContext(GridBrowseContext);
  if (!context) throw new Error('useGridBrowse must be used within GridBrowseProvider');
  return context;
}
