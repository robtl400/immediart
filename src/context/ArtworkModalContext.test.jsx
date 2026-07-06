/**
 * ArtworkModalContext tests
 *
 * Covers: the close-delay race — reopening a new artwork during the
 * MODAL_CLOSE_DELAY_MS window must cancel the pending clear so the new
 * artwork isn't wiped — and the normal delayed clear on closeModal.
 *
 * Pattern: vi.useFakeTimers() — the close-clear runs on a setTimeout.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ArtworkModalProvider, useArtworkModal } from './ArtworkModalContext';
import { MODAL_CLOSE_DELAY_MS } from '../utils/constants';

const wrapper = ({ children }) => (
  <ArtworkModalProvider>{children}</ArtworkModalProvider>
);

describe('ArtworkModalContext', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('openModal during the close delay cancels the pending clear (new artwork survives)', () => {
    const a = { id: 1, title: 'A' };
    const b = { id: 2, title: 'B' };
    const { result } = renderHook(() => useArtworkModal(), { wrapper });

    act(() => result.current.openModal(a));
    act(() => result.current.closeModal());
    act(() => result.current.openModal(b));

    // Advance well past the close delay — the stale close timer must not
    // wipe the newly opened artwork
    act(() => { vi.advanceTimersByTime(MODAL_CLOSE_DELAY_MS + 100); });

    expect(result.current.selectedArtwork).toBe(b);
    expect(result.current.isOpen).toBe(true);
  });

  it('closeModal clears selectedArtwork only after MODAL_CLOSE_DELAY_MS', () => {
    const a = { id: 1, title: 'A' };
    const { result } = renderHook(() => useArtworkModal(), { wrapper });

    act(() => result.current.openModal(a));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedArtwork).toBe(a);

    act(() => result.current.closeModal());

    // isOpen flips immediately; artwork stays for the exit animation
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedArtwork).toBe(a);

    act(() => { vi.advanceTimersByTime(MODAL_CLOSE_DELAY_MS); });
    expect(result.current.selectedArtwork).toBeNull();
  });

  it('useArtworkModal throws when used outside the provider', () => {
    // renderHook logs the thrown error via console.error — silence it
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useArtworkModal())).toThrow(
      'useArtworkModal must be used within an ArtworkModalProvider'
    );
    spy.mockRestore();
  });
});
