/**
 * Artworks Context
 * Manages state for fetching, storing, and providing artwork data
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { fetchAllObjectIDs, batchFetchArtworks, shuffleArray, BATCH_SIZE } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';

const ArtworksContext = createContext(null);

// Action types
const ACTIONS = {
  INIT_START: 'INIT_START',
  INIT_SUCCESS: 'INIT_SUCCESS',
  INIT_ERROR: 'INIT_ERROR',
  LOAD_MORE_START: 'LOAD_MORE_START',
  LOAD_MORE_SUCCESS: 'LOAD_MORE_SUCCESS',
  LOAD_MORE_ERROR: 'LOAD_MORE_ERROR',
  RESHUFFLE: 'RESHUFFLE'
};

// Initial state
const initialState = {
  artworks: [],
  allObjectIDs: [],
  shownIDs: new Set(),
  currentIndex: 0,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  initialized: false
};

function artworksReducer(state, action) {
  switch (action.type) {
    case ACTIONS.INIT_START:
      return { ...state, loading: true, error: null };

    case ACTIONS.INIT_SUCCESS:
      return {
        ...state,
        loading: false,
        initialized: true,
        allObjectIDs: action.payload.allIDs,
        artworks: action.payload.artworks,
        shownIDs: new Set(action.payload.artworks.map(a => a.id)),
        currentIndex: action.payload.nextIndex,
        hasMore: action.payload.hasMore
      };

    case ACTIONS.INIT_ERROR:
      return { ...state, loading: false, error: action.payload };

    case ACTIONS.LOAD_MORE_START:
      return { ...state, loadingMore: true };

    case ACTIONS.LOAD_MORE_SUCCESS: {
      const newShownIDs = new Set(state.shownIDs);
      action.payload.artworks.forEach(a => newShownIDs.add(a.id));

      // Memory management: keep only last 30 artworks
      const combinedArtworks = [...state.artworks, ...action.payload.artworks];
      const trimmedArtworks = combinedArtworks.length > 30
        ? combinedArtworks.slice(-30)
        : combinedArtworks;

      return {
        ...state,
        loadingMore: false,
        artworks: trimmedArtworks,
        shownIDs: newShownIDs,
        currentIndex: action.payload.nextIndex,
        hasMore: action.payload.hasMore
      };
    }

    case ACTIONS.LOAD_MORE_ERROR:
      return { ...state, loadingMore: false, error: action.payload };

    case ACTIONS.RESHUFFLE:
      return {
        ...state,
        allObjectIDs: shuffleArray(state.allObjectIDs),
        shownIDs: new Set(),
        currentIndex: 0,
        hasMore: true
      };

    default:
      return state;
  }
}

/**
 * Gets unused IDs from the shuffled list
 */
function getUnusedIDs(allIDs, shownIDs, startIndex, count) {
  const unused = [];
  for (let i = startIndex; i < allIDs.length && unused.length < count; i++) {
    if (!shownIDs.has(allIDs[i])) {
      unused.push(allIDs[i]);
    }
  }
  return unused;
}

export function ArtworksProvider({ children }) {
  const [state, dispatch] = useReducer(artworksReducer, initialState);

  // Initialize on mount
  const initializeArtworks = useCallback(async () => {
    dispatch({ type: ACTIONS.INIT_START });

    try {
      // Fetch all IDs
      const allIDs = await fetchAllObjectIDs();
      const shuffledIDs = shuffleArray(allIDs);

      // Fetch initial batch (fetch more IDs than needed to account for invalid ones)
      const idsToTry = shuffledIDs.slice(0, BATCH_SIZE * 3);
      const rawArtworks = await batchFetchArtworks(idsToTry, BATCH_SIZE);
      const artworks = rawArtworks.map(transformAPIToDisplay);

      dispatch({
        type: ACTIONS.INIT_SUCCESS,
        payload: {
          allIDs: shuffledIDs,
          artworks,
          nextIndex: BATCH_SIZE * 3,
          hasMore: shuffledIDs.length > BATCH_SIZE * 3
        }
      });
    } catch (error) {
      dispatch({ type: ACTIONS.INIT_ERROR, payload: error.message });
    }
  }, []);

  // Load more artworks for infinite scroll
  const loadMoreArtworks = useCallback(async () => {
    if (state.loadingMore || !state.hasMore) return;

    dispatch({ type: ACTIONS.LOAD_MORE_START });

    try {
      let idsToTry;
      let nextIndex;

      // Check if we've shown all IDs - reshuffle if needed
      if (state.currentIndex >= state.allObjectIDs.length) {
        // Reshuffle and start over
        const reshuffled = shuffleArray(state.allObjectIDs);
        idsToTry = reshuffled.slice(0, BATCH_SIZE * 3);
        nextIndex = BATCH_SIZE * 3;

        // Dispatch reshuffle first
        dispatch({ type: ACTIONS.RESHUFFLE });
      } else {
        // Get next batch of IDs (skip already shown)
        idsToTry = getUnusedIDs(
          state.allObjectIDs,
          state.shownIDs,
          state.currentIndex,
          BATCH_SIZE * 3
        );
        nextIndex = state.currentIndex + BATCH_SIZE * 3;
      }

      const rawArtworks = await batchFetchArtworks(idsToTry, BATCH_SIZE);
      const artworks = rawArtworks.map(transformAPIToDisplay);

      dispatch({
        type: ACTIONS.LOAD_MORE_SUCCESS,
        payload: {
          artworks,
          nextIndex,
          hasMore: nextIndex < state.allObjectIDs.length || state.allObjectIDs.length > 0
        }
      });
    } catch (error) {
      dispatch({ type: ACTIONS.LOAD_MORE_ERROR, payload: error.message });
    }
  }, [state.loadingMore, state.hasMore, state.currentIndex, state.allObjectIDs, state.shownIDs]);

  // Retry after error
  const retry = useCallback(() => {
    if (!state.initialized) {
      initializeArtworks();
    } else {
      loadMoreArtworks();
    }
  }, [state.initialized, initializeArtworks, loadMoreArtworks]);

  // Auto-initialize on mount
  useEffect(() => {
    initializeArtworks();
  }, [initializeArtworks]);

  const value = {
    artworks: state.artworks,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    hasMore: state.hasMore,
    initialized: state.initialized,
    loadMoreArtworks,
    retry,
    initializeArtworks
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
