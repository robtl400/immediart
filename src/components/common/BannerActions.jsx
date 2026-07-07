import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLikes } from '../../context/LikesContext';

const FIRST_LIKE_KEY = 'immediart_first_like_seen';

/**
 * Right-aligned banner action cluster: a search magnifier and a heart with a
 * like-count badge that navigates to /liked (the heart stays visible at count 0
 * so new users can still discover the collection).
 *
 * The magnifier opens the full-width search input (owned by Banner, so it can
 * take over the whole masthead); `onOpenSearch` and `toggleRef` are wired up
 * from there. On the user's first-ever like, a one-shot "Saved to Liked" label
 * pulses by the heart — likes were previously a dead end, so this teaches that
 * they're now saved and browsable.
 */
export default function BannerActions({ onOpenSearch, toggleRef, searchOpen = false }) {
  const navigate = useNavigate();
  const { likedIds } = useLikes();
  const count = likedIds.size;

  // The hint shows once, the first time the user has any likes and hasn't seen
  // it before. `dismissed` is seeded from the persisted flag, so it's derived
  // (no ref-during-render, no sync setState-in-effect); the effect persists the
  // flag and auto-dismisses after a beat.
  const [dismissed, setDismissed] = useState(() => {
    try { return Boolean(localStorage.getItem(FIRST_LIKE_KEY)); } catch { return true; }
  });
  const showHint = count > 0 && !dismissed;

  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => {
      setDismissed(true);
      try { localStorage.setItem(FIRST_LIKE_KEY, '1'); } catch { /* ignore */ }
    }, 2500);
    return () => clearTimeout(t);
  }, [showHint]);

  return (
    <div className="banner-actions">
      {showHint && <span className="banner-like-hint" role="status" aria-live="polite">Saved to Liked</span>}
      <button
        ref={toggleRef}
        type="button"
        className="banner-icon-btn banner-search-toggle"
        onClick={onOpenSearch}
        data-search-toggle
        aria-label="Search the collection"
        aria-expanded={searchOpen}
        aria-controls="banner-search"
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="7" />
          <line x1="15.6" y1="15.6" x2="21" y2="21" />
        </svg>
      </button>
      <button
        type="button"
        className="banner-icon-btn"
        onClick={() => navigate('/liked')}
        aria-label={count ? `Liked artworks (${count})` : 'Liked artworks'}
      >
        <span className="banner-heart" aria-hidden="true">♥</span>
        {count > 0 && <span className="banner-badge">{count > 99 ? '99+' : count}</span>}
      </button>
    </div>
  );
}
