/**
 * Artwork Modal Context
 * Manages state for the artwork detail modal overlay
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useCallback } from 'react';

const ArtworkModalContext = createContext(null);

export function ArtworkModalProvider({ children }) {
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback((artwork) => {
    setSelectedArtwork(artwork);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    // Delay clearing artwork to allow for exit animation if needed
    setTimeout(() => setSelectedArtwork(null), 200);
  }, []);

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
