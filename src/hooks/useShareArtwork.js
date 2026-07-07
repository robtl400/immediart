import { useState, useRef, useEffect, useCallback } from 'react';
import { SHARE_FEEDBACK_MS } from '../utils/constants';

/**
 * Share an artwork via the Web Share API, falling back to copying its deep link
 * to the clipboard. `copied` drives the transient "Copied!" label; the timer is
 * cleared on unmount and reset on re-share. Shared by the feed card and modal.
 */
export function useShareArtwork() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const share = useCallback(async (artwork) => {
    const url = `${window.location.origin}/artwork/${artwork.id}`;
    const copyWithFeedback = async () => {
      try {
        await navigator.clipboard?.writeText(url);
      } catch { /* clipboard unavailable */ }
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), SHARE_FEEDBACK_MS);
    };

    if (navigator.share) {
      try {
        await navigator.share({ title: artwork.title, text: `${artwork.title} by ${artwork.artistName}`, url });
      } catch (err) {
        if (err.name !== 'AbortError') await copyWithFeedback();
      }
    } else {
      await copyWithFeedback();
    }
  }, []);

  return { copied, share };
}
