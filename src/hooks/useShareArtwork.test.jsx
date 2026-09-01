/**
 * useShareArtwork — share sheet first, clipboard fallback.
 *
 * Covers: the share text for named and anonymous works, "Copied!" only after
 * a successful clipboard write, the fallback when the share sheet is
 * dismissed vs. unavailable, and the feedback timer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShareArtwork, shareLabel } from './useShareArtwork';
import { SHARE_FEEDBACK_MS } from '../utils/constants';

const named = { id: 7, title: 'The Garter', artistName: 'Jean François de Troy' };
const anonymous = { id: 8, title: 'Portrait of a Man', artistName: '' };

describe('useShareArtwork', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: undefined });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('copies the deep link and shows Copied! for SHARE_FEEDBACK_MS', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    const { result } = renderHook(() => useShareArtwork());

    await act(async () => { await result.current.share(named); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/artwork/7`);
    expect(result.current.copied).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_FEEDBACK_MS); });
    expect(result.current.copied).toBe(false);
  });

  it('never claims Copied! when the clipboard write is refused', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    const { result } = renderHook(() => useShareArtwork());

    await act(async () => { await result.current.share(named); });
    expect(writeText).toHaveBeenCalled();
    expect(result.current.copied).toBe(false);
    expect(result.current.failed).toBe(true); // still feedback, just an honest one
  });

  it('never claims Copied! when there is no clipboard API at all', async () => {
    const { result } = renderHook(() => useShareArtwork());
    await act(async () => { await result.current.share(named); });
    expect(result.current.copied).toBe(false);
    expect(result.current.failed).toBe(true);
  });

  it('maps feedback state to the button label', () => {
    expect(shareLabel({ copied: false, failed: false })).toBe('Share');
    expect(shareLabel({ copied: true, failed: false })).toBe('Copied!');
    expect(shareLabel({ copied: false, failed: true })).toBe("Couldn't copy");
  });

  it('uses the share sheet when available, with the anonymous-safe text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
    const { result } = renderHook(() => useShareArtwork());

    await act(async () => { await result.current.share(anonymous); });
    expect(share).toHaveBeenCalledWith({ title: 'Portrait of a Man', text: 'Portrait of a Man', url: `${window.location.origin}/artwork/8` });
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.copied).toBe(false);
  });

  it('falls back to the clipboard when the share sheet fails, but not when the user dismisses it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn()
      .mockRejectedValueOnce(new DOMException('dismissed', 'AbortError'))
      .mockRejectedValueOnce(new Error('share failed'));
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
    const { result } = renderHook(() => useShareArtwork());

    await act(async () => { await result.current.share(named); }); // dismissed
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.copied).toBe(false);

    await act(async () => { await result.current.share(named); }); // failed
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(result.current.copied).toBe(true);
  });
});
