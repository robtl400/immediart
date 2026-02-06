/**
 * Artworks Context
 * Manages state for fetching, storing, and providing artwork data
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllObjectIDs, batchFetchArtworks, shuffleArray } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';

const ArtworksContext = createContext(null);

const BATCH_SIZE = 2; // Artworks to fetch per load

// Preload an image and return a promise that resolves when loaded
function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false); // Still resolve to not block on failed images
    img.src = url;
  });
}

// Preload all images for a batch of artworks
async function preloadArtworkImages(artworks) {
  await Promise.all(artworks.map(a => preloadImage(a.imageUrl)));
}

export function ArtworksProvider({ children }) {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Refs for data that persists across renders but doesn't trigger re-renders
  const allIDsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const shownIDsRef = useRef(new Set());
  const fetchingRef = useRef(false);

  // Single fetch function for both initial and subsequent loads
  const fetchArtworks = useCallback(async (isInitial = false) => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      if (isInitial) {
        setLoading(true);
        // Fetch and shuffle all IDs once
        const allIDs = await fetchAllObjectIDs();
        allIDsRef.current = shuffleArray(allIDs);
        currentIndexRef.current = 0;
        shownIDsRef.current = new Set();
      } else {
        setLoadingMore(true);
      }

      // Get next batch of IDs to try
      const idsToTry = [];
      let i = currentIndexRef.current;
      while (idsToTry.length < BATCH_SIZE * 3 && i < allIDsRef.current.length) {
        const id = allIDsRef.current[i];
        if (!shownIDsRef.current.has(id)) {
          idsToTry.push(id);
        }
        i++;
      }
      currentIndexRef.current = i;

      // Check if we've exhausted all IDs
      if (idsToTry.length === 0) {
        setHasMore(false);
        return;
      }

      // Fetch artworks
      const rawArtworks = await batchFetchArtworks(idsToTry, BATCH_SIZE);
      const newArtworks = rawArtworks.map(transformAPIToDisplay);

      // Preload images before showing (only for initial load)
      if (isInitial) {
        await preloadArtworkImages(newArtworks);
      }

      // Track shown IDs
      newArtworks.forEach(a => shownIDsRef.current.add(a.id));

      // Update state
      setArtworks(prev => {
        const combined = [...prev, ...newArtworks];
        // Keep last 30 for memory management
        return combined.length > 30 ? combined.slice(-30) : combined;
      });

      // Check if more available
      setHasMore(currentIndexRef.current < allIDsRef.current.length);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    fetchArtworks(true);
  }, [fetchArtworks]);

  // Public load more function
  const loadMoreArtworks = useCallback(() => {
    if (!fetchingRef.current && hasMore && !loadingMore) {
      fetchArtworks(false);
    }
  }, [fetchArtworks, hasMore, loadingMore]);

  // Retry function
  const retry = useCallback(() => {
    if (artworks.length === 0) {
      fetchArtworks(true);
    } else {
      fetchArtworks(false);
    }
  }, [fetchArtworks, artworks.length]);

  const value = {
    artworks,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMoreArtworks,
    retry
  };

  return (
    <ArtworksContext.Provider value={value}>
      {children}
    </ArtworksContext.Provider>
  );
}

/**
 * Custom hook for consuming context
 */
export function useArtworks() {
  const context = useContext(ArtworksContext);
  if (!context) {
    throw new Error('useArtworks must be used within an ArtworksProvider');
  }
  return context;
}
