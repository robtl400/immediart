/**
 * Regression: ISSUE-004 — Share button gives no feedback when the clipboard write fails
 * Found by /qa on 2026-03-21
 * Report: .gstack/qa-reports/qa-report-localhost-2026-03-21.md
 *
 * Root cause: the clipboard write was awaited without try-catch, so a refused
 * write aborted the handler before any feedback state was set. The button must
 * always answer a tap — "Copied!" when the link really is on the clipboard,
 * "Couldn't copy" when it isn't (never a false "Copied!").
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ArtworkCard from './ArtworkCard';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));

const artwork = {
  id: 42,
  title: 'Test Art',
  artistName: 'Test Artist',
  username: 'test_artist',
  description: 'A test artwork',
  imageUrl: 'https://example.com/img.jpg',
  tags: [],
  date: '2024',
  comments: [],
};

describe('ArtworkCard — Share feedback (ISSUE-004 regression)', () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    vi.useRealTimers();
  });

  it('answers a refused clipboard write with "Couldn\'t copy" — feedback, but never a false "Copied!"', async () => {
    // Simulate: navigator.share is undefined, clipboard.writeText throws
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('Write permission denied', 'NotAllowedError')) },
      configurable: true,
    });

    vi.useFakeTimers();
    render(<ArtworkCard artwork={artwork} isLiked={false} onLike={vi.fn()} onImageClick={vi.fn()} />);

    const shareBtn = screen.getByRole('button', { name: /share/i });
    await act(async () => {
      fireEvent.click(shareBtn);
      await Promise.resolve();
    });

    expect(screen.queryByText('Copied!')).toBeNull();
    expect(screen.getByText("Couldn't copy")).toBeTruthy();

    act(() => { vi.advanceTimersByTime(2001); });
    expect(screen.queryByText("Couldn't copy")).toBeNull();
    expect(screen.getByText('Share')).toBeTruthy();
  });

  it('shows "Copied!" when clipboard.writeText succeeds (no share API)', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    vi.useFakeTimers();
    render(<ArtworkCard artwork={artwork} isLiked={false} onLike={vi.fn()} onImageClick={vi.fn()} />);

    const shareBtn = screen.getByRole('button', { name: /share/i });
    await act(async () => {
      fireEvent.click(shareBtn);
      await Promise.resolve();
    });

    expect(screen.getByText('Copied!')).toBeTruthy();
  });

  it('shows "Couldn\'t copy" when navigator.share throws non-AbortError and clipboard also throws', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('Share failed', 'InvalidStateError')),
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('Write permission denied', 'NotAllowedError')) },
      configurable: true,
    });

    vi.useFakeTimers();
    render(<ArtworkCard artwork={artwork} isLiked={false} onLike={vi.fn()} onImageClick={vi.fn()} />);

    const shareBtn = screen.getByRole('button', { name: /share/i });
    await act(async () => {
      fireEvent.click(shareBtn);
      await Promise.resolve();
    });

    expect(screen.queryByText('Copied!')).toBeNull();
    expect(screen.getByText("Couldn't copy")).toBeTruthy();
  });
});
