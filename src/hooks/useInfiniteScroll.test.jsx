/**
 * useInfiniteScroll hook tests
 *
 * Covers: IntersectionObserver constructed with root = rootRef.current
 * (rootRef is a ref object read at effect time), intersection firing
 * onLoadMore, and the enabled/hasMore/isLoading gates (no observer is
 * created when any gate fails).
 *
 * Pattern: IntersectionObserver stubbed with a recording mock class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import useInfiniteScroll from './useInfiniteScroll';

// ─── IntersectionObserver mock ────────────────────────────────────────────────

let observerInstances;

class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = [];
    this.disconnected = false;
    observerInstances.push(this);
  }
  observe(el) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  trigger(isIntersecting) { this.callback([{ isIntersecting }]); }
}

// ─── harness ──────────────────────────────────────────────────────────────────

function Harness(options) {
  const sentinelRef = useInfiniteScroll(options);
  return <div ref={sentinelRef} data-testid="sentinel" />;
}

const defaultOptions = (overrides = {}) => ({
  onLoadMore: vi.fn(),
  hasMore: true,
  isLoading: false,
  enabled: true,
  ...overrides,
});

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    observerInstances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs the observer with root = rootRef.current', () => {
    const rootEl = document.createElement('div');
    const rootRef = { current: rootEl };
    render(<Harness {...defaultOptions()} rootRef={rootRef} />);

    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].options.root).toBe(rootEl);
  });

  it('falls back to root = null when no rootRef is provided', () => {
    render(<Harness {...defaultOptions()} />);

    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].options.root).toBeNull();
  });

  it('observes the sentinel element and passes rootMargin through', () => {
    const { getByTestId } = render(
      <Harness {...defaultOptions()} rootMargin="200px" />
    );

    expect(observerInstances[0].observed).toContain(getByTestId('sentinel'));
    expect(observerInstances[0].options.rootMargin).toBe('200px');
  });

  it('calls onLoadMore when the sentinel intersects', () => {
    const onLoadMore = vi.fn();
    render(<Harness {...defaultOptions({ onLoadMore })} />);

    observerInstances[0].trigger(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not call onLoadMore when the entry is not intersecting', () => {
    const onLoadMore = vi.fn();
    render(<Harness {...defaultOptions({ onLoadMore })} />);

    observerInstances[0].trigger(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('creates no observer (and never fires) when enabled=false', () => {
    const onLoadMore = vi.fn();
    render(<Harness {...defaultOptions({ onLoadMore, enabled: false })} />);

    expect(observerInstances).toHaveLength(0);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('creates no observer when hasMore=false', () => {
    const onLoadMore = vi.fn();
    render(<Harness {...defaultOptions({ onLoadMore, hasMore: false })} />);

    expect(observerInstances).toHaveLength(0);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('creates no observer while isLoading=true', () => {
    const onLoadMore = vi.fn();
    render(<Harness {...defaultOptions({ onLoadMore, isLoading: true })} />);

    expect(observerInstances).toHaveLength(0);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Harness {...defaultOptions()} />);
    expect(observerInstances[0].disconnected).toBe(false);

    unmount();
    expect(observerInstances[0].disconnected).toBe(true);
  });
});
