import { useState, useRef, useEffect, useCallback } from 'react';
import { SHARE_FEEDBACK_MS } from '../utils/constants';
import { artworkCaption } from '../utils/transformers';

/**
 * Share an artwork via the Web Share API, falling back to copying its deep link
 * to the clipboard. The transient button label reports what actually happened:
 * `copied` after a successful clipboard write, `failed` when the write was
 * refused or no clipboard API exists — the user always gets feedback, and is
 * never told a link is on their clipboard when it isn't. The timer is cleared
 * on unmount and reset on re-share. Shared by the feed card and modal.
 */
export function useShareArtwork() {
  const [status, setStatus] = useState(null); // 'copied' | 'failed' | null
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const share = useCallback(async (artwork) => {
    const url = `${window.location.origin}/artwork/${artwork.id}`;
    const flash = (next) => {
      setStatus(next);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStatus(null), SHARE_FEEDBACK_MS);
    };
    const copyWithFeedback = async () => {
      if (!navigator.clipboard?.writeText) { flash('failed'); return; }
      try {
        await navigator.clipboard.writeText(url);
        flash('copied');
      } catch {
        flash('failed'); // permission denied, insecure context
      }
    };

    if (navigator.share) {
      try {
        await navigator.share({ title: artwork.title, text: artworkCaption(artwork), url });
      } catch (err) {
        if (err.name !== 'AbortError') await copyWithFeedback();
      }
    } else {
      await copyWithFeedback();
    }
  }, []);

  return { copied: status === 'copied', failed: status === 'failed', share };
}

// The label the share button shows for a given feedback state.
export const shareLabel = ({ copied, failed }) =>
  copied ? 'Copied!' : failed ? "Couldn't copy" : 'Share';
