/**
 * Artworks Context - Discovery feed state management
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { fetchAllObjectIDs } from '../services/metAPI';
import { usePaginatedFetch } from '../hooks/usePaginatedFetch';
import { FEED_BATCH_SIZE, FEED_INITIAL_BATCH_SIZE, MAX_ARTWORKS_IN_MEMORY, RATE_LIMIT_RECOVERY_MS } from '../utils/constants';

const ArtworksContext = createContext(null);

export function ArtworksProvider({ children }) {
  const feed = usePaginatedFetch({
    shuffleIDs:       true,
    batchSize:        FEED_BATCH_SIZE,
    initialBatchSize: FEED_INITIAL_BATCH_SIZE,
    maxInMemory:      MAX_ARTWORKS_IN_MEMORY,
    strictValidation: true,
  });

  // Last feed scroll offset, preserved across route changes (the provider
  // outlives the feed component) so returning from /liked, /search or a grid
  // lands where the user left off.
  const feedScrollRef = useRef(0);

  // Initialize on mount
  useEffect(() => {
    feed.reset((signal) => fetchAllObjectIDs(signal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry — waits for rate limit recovery, then re-fetches from scratch if
  // no artworks are shown, or re-fetches more if some artworks exist
  const retry = useCallback(async () => {
    feed.pause();
    await new Promise(r => setTimeout(r, RATE_LIMIT_RECOVERY_MS));
    feed.reset((signal) => fetchAllObjectIDs(signal));
  }, [feed]);

  // Refresh — a fresh shuffle of the feed. The cache stays: the ID list and
  // every cached artwork (including the negative cache that keeps rejected
  // ids from costing ~12 requests per card) serve the new feed instantly, and
  // a "go home" tap must never spend the request budget on refetching what
  // the app already knows.
  const refresh = useCallback(() => {
    feed.pause();
    feed.reset((signal) => fetchAllObjectIDs(signal));
  }, [feed]);

  const value = {
    artworks:       feed.artworks,
    loading:        feed.loading,
    loadingMore:    feed.loadingMore,
    error:          feed.error,
    hasMore:        feed.hasMore,
    loadMoreArtworks: feed.loadMore,
    retryLoadMore:  feed.retryLoadMore,
    retry,
    refresh,
    pause:          feed.pause,
    feedScrollRef,
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
