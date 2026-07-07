/**
 * Likes Context — the single source of truth for liked artworks.
 *
 * Persists to localStorage under a versioned shape and migrates the legacy
 * bare-array format forward on first load. IDs are normalised to Number at
 * every boundary because objectIDs are numeric but route params arrive as
 * strings — a deep-loaded modal must read the same like state as the feed.
 * Insertion order is preserved (Set), so /liked can show newest-first.
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const LIKES_KEY = 'immediart_liked_artworks';
const LIKES_VERSION = 1;

// Read + migrate. Legacy was a bare array of ids; v1 is { v:1, ids:[...] }.
function readLikes() {
  try {
    const raw = localStorage.getItem(LIKES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : (parsed?.ids ?? []);
    return ids.map(Number).filter(Number.isFinite);
  } catch {
    return [];
  }
}

const LikesContext = createContext(null);

export function LikesProvider({ children }) {
  const [likedIds, setLikedIds] = useState(() => new Set(readLikes()));

  // Persist as the versioned shape (this is also what migrates a legacy array
  // forward — the first write replaces the bare array with { v, ids }).
  useEffect(() => {
    try {
      localStorage.setItem(LIKES_KEY, JSON.stringify({ v: LIKES_VERSION, ids: [...likedIds] }));
    } catch { /* ignore quota errors */ }
  }, [likedIds]);

  // Cross-tab sync: mirror likes written by another tab. Only replace state when
  // the incoming set actually differs, otherwise the two tabs would ping-pong
  // (each write fires the other's storage event, which triggers another write).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== LIKES_KEY) return;
      const incoming = readLikes();
      setLikedIds(prev => {
        if (prev.size === incoming.length && incoming.every(id => prev.has(id))) return prev;
        return new Set(incoming);
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleLike = useCallback((id) => {
    const n = Number(id);
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }, []);

  // Remove a like without toggling it back on — used when an artwork 404s.
  const pruneLike = useCallback((id) => {
    const n = Number(id);
    setLikedIds(prev => {
      if (!prev.has(n)) return prev;
      const next = new Set(prev);
      next.delete(n);
      return next;
    });
  }, []);

  const isLiked = useCallback((id) => likedIds.has(Number(id)), [likedIds]);

  const value = { likedIds, toggleLike, pruneLike, isLiked };
  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>;
}

export function useLikes() {
  const ctx = useContext(LikesContext);
  if (!ctx) throw new Error('useLikes must be used within a LikesProvider');
  return ctx;
}
