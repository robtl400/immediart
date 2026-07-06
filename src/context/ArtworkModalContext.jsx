/**
 * Artwork Modal Context
 * Manages state for the artwork detail modal overlay
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { MODAL_CLOSE_DELAY_MS } from '../utils/constants';

const ArtworkModalContext = createContext(null);

export function ArtworkModalProvider({ children }) {
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef(null);

  const openModal = useCallback((artwork) => {
    // Cancel a pending close-clear so it can't wipe the newly opened artwork
    clearTimeout(closeTimerRef.current);
    setSelectedArtwork(artwork);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    // Delay clearing artwork to allow for exit animation if needed
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setSelectedArtwork(null), MODAL_CLOSE_DELAY_MS);
  }, []);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const value = {
    selectedArtwork,
    isOpen,
    openModal,
    closeModal
  };

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
