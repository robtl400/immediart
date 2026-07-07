/**
 * Artwork Modal Context
 *
 * The modal's open/closed state lives in the URL (a /artwork/:id route rendered
 * over the current page — see App.jsx). This context only:
 *   - caches the artwork object openModal() was called with, so the modal can
 *     render instantly when opened from a card (no refetch); a direct load
 *     fetches by id itself.
 *   - provides navigation helpers that push/pop that route.
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const ArtworkModalContext = createContext(null);

export function ArtworkModalProvider({ children }) {
  const [cachedArtwork, setCachedArtwork] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const openModal = useCallback((artwork) => {
    setCachedArtwork(artwork);
    // Remember the page we opened from so closing returns to it (and the page
    // routes keep rendering it behind the modal).
    navigate(`/artwork/${artwork.id}`, { state: { background: location } });
  }, [navigate, location]);

  const closeModal = useCallback(() => {
    // Opened from a page → pop back to it. Direct load / shared link (no
    // background) → replace to the feed so we never eject the visitor off-site.
    if (location.state?.background) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate, location]);

  const value = { cachedArtwork, openModal, closeModal };

  return (
    <ArtworkModalContext.Provider value={value}>
      {children}
    </ArtworkModalContext.Provider>
  );
}

export function useArtworkModal() {
  const context = useContext(ArtworkModalContext);
  if (!context) {
    throw new Error('useArtworkModal must be used within an ArtworkModalProvider');
  }
  return context;
}
