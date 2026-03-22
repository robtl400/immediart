/**
 * Regression: ISSUE-004 — Share button "Copied!" feedback not shown when clipboard write fails
 * Found by /qa on 2026-03-21
 * Report: .gstack/qa-reports/qa-report-localhost-2026-03-21.md
 *
 * Root cause: the else branch in handleShare called `await navigator.clipboard?.writeText(url)`
 * without try-catch. If clipboard throws (permission denied, insecure context, etc.),
 * the async function aborts before `setShareCopied(true)` is reached, so "Copied!" never shows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('shows "Copied!" even when clipboard.writeText throws a permission error', async () => {
    // Simulate: navigator.share is undefined, clipboard.writeText throws
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('Write permission denied', 'NotAllowedError')) },
      configurable: true,
    });

    vi.useFakeTimers();
    render(<ArtworkCard artwork={artwork} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);

    const shareBtn = screen.getByRole('button', { name: /share/i });
    await act(async () => {
      fireEvent.click(shareBtn);
      await Promise.resolve();
    });

    expect(screen.getByText('Copied!')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(2001); });
    expect(screen.queryByText('Copied!')).toBeNull();
  });

  it('shows "Copied!" when clipboard.writeText succeeds (no share API)', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    vi.useFakeTimers();
    render(<ArtworkCard artwork={artwork} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);

    const shareBtn = screen.getByRole('button', { name: /share/i });
    await act(async () => {
      fireEvent.click(shareBtn);
      await Promise.resolve();
    });

    expect(screen.getByText('Copied!')).toBeTruthy();
  });

  it('shows "Copied!" when navigator.share throws non-AbortError and clipboard also throws', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('Share failed', 'InvalidStateError')),
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('Write permission denied', 'NotAllowedError')) },
      configurable: true,
    });

    vi.useFakeTimers();
    render(<ArtworkCard artwork={artwork} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);

    const shareBtn = screen.getByRole('button', { name: /share/i });
    await act(async () => {
      fireEvent.click(shareBtn);
      await Promise.resolve();
    });

    expect(screen.getByText('Copied!')).toBeTruthy();
  });
});
