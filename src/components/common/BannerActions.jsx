import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLikes } from '../../context/LikesContext';

const FIRST_LIKE_KEY = 'immediart_first_like_seen';

/**
 * Right-aligned banner action cluster. Today: a heart with a like-count badge
 * that navigates to /liked (the heart stays visible at count 0 so new users can
 * still discover the collection). The C4 search icon slots in to its left.
 *
 * On the user's first-ever like, a one-shot "Saved to Liked" label pulses by the
 * heart — likes were previously a dead end, so this teaches that they're now
 * saved and browsable.
 */
export default function BannerActions() {
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
