/**
 * Grid Browse Context - Search results state management
 *
 * Thin wrapper around usePaginatedFetch. Owns search-specific state
 * (searchType, searchTerm, totalCount, lastSearchTimeRef) and wires
 * initSearch() → grid.reset(fetchIDs).
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { searchByArtist, searchByTag } from '../services/metAPI';
import { getCachedIDs } from '../services/artworkCache';
import { preloadArtworkImages } from '../utils/imageLoader';
import { usePaginatedFetch } from '../hooks/usePaginatedFetch';
import { delayOrAbort } from '../utils/delay';
import {
  GRID_BATCH_SIZE,
  GRID_INITIAL_BATCH_SIZE,
  SEARCH_COOLDOWN_MS,
  NAVIGATION_DELAY_MS,
} from '../utils/constants';

const GridBrowseContext = createContext(null);

export function GridBrowseProvider({ children }) {
  const [searchType, setSearchType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const lastSearchTimeRef = useRef(0);

  const grid = usePaginatedFetch({
    shuffleIDs: false,
    batchSize: GRID_BATCH_SIZE,
    initialBatchSize: GRID_INITIAL_BATCH_SIZE,
    maxInMemory: Infinity,
    onBatchReady: (artworks, signal) => preloadArtworkImages(artworks, signal),
  });

  // Destructure stable callbacks so useCallback deps don't change every render
  const { reset: gridReset, pause: gridPause } = grid;

  // initSearch — constructs a fetchIDs closure with navigation/cooldown delays,
  // then kicks off a fresh fetch via grid.reset() synchronously.
  const initSearch = useCallback((type, term, seedArtworks = []) => {
    setSearchType(type);
    setSearchTerm(term);
    setTotalCount(0);

    const searchFn = type === 'artist' ? searchByArtist : searchByTag;
    const cacheKey = type === 'artist' ? `ids:artist:${term}` : `ids:tag:${term}`;

    gridReset(async (signal) => {
      const cachedIDs = await getCachedIDs(cacheKey);

      if (!cachedIDs) {
        // Navigation delay — gives the rate limiter time to recover after page change
        await delayOrAbort(NAVIGATION_DELAY_MS, signal);

        // Additional cooldown if a live search was fired recently
        const timeSince = Date.now() - lastSearchTimeRef.current;
        if (timeSince < SEARCH_COOLDOWN_MS) {
          await delayOrAbort(SEARCH_COOLDOWN_MS - timeSince, signal);
        }
      }

      lastSearchTimeRef.current = Date.now();
      const ids = cachedIDs ?? await searchFn(term, signal);
      setTotalCount(ids.length);
      return ids;
    }, seedArtworks);
  }, [gridReset]);

  // abort — pause all in-flight work without resetting displayed artworks
  const abort = useCallback(() => {
    gridPause();
  }, [gridPause]);

  const value = {
    artworks:     grid.artworks,
    loading:      grid.loading,
    loadingMore:  grid.loadingMore,
    error:        grid.error,
    hasMore:      grid.hasMore,
    searchType,
    searchTerm,
    totalCount,
    initSearch,
    loadMore:     grid.loadMore,
    abort,
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
