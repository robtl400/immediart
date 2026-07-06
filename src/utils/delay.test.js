/**
 * delay utility tests
 *
 * Covers: delay (resolves after ms), addJitter (adds noise in range),
 * debounce (trailing-edge invoke with latest args, cancel),
 * delayOrAbort (resolves normally, rejects on abort signal).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { delay, addJitter, debounce, delayOrAbort } from './delay';

describe('delay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves after the specified ms', async () => {
    const p = delay(500);
    vi.advanceTimersByTime(500);
    await expect(p).resolves.toBeUndefined();
  });
});

describe('addJitter', () => {
  it('returns a value >= ms', () => {
    for (let i = 0; i < 20; i++) {
      expect(addJitter(100)).toBeGreaterThanOrEqual(100);
    }
  });

  it('returns a value < ms * 1.3', () => {
    for (let i = 0; i < 20; i++) {
      expect(addJitter(100)).toBeLessThan(130);
    }
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after the wait with the latest args', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    debounced('third');

    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('each call resets the wait window', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    vi.advanceTimersByTime(60);
    debounced('b'); // resets the 100ms window

    vi.advanceTimersByTime(60); // 120ms after first call, 60ms after second
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('cancel() prevents the pending invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('pending');
    debounced.cancel();

    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('delayOrAbort', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves normally when no signal is provided', async () => {
    const p = delayOrAbort(300);
    vi.advanceTimersByTime(300);
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects with AbortError when signal fires before timeout', async () => {
    const ctrl = new AbortController();
    const p = delayOrAbort(1000, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects immediately with AbortError when signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const p = delayOrAbort(1000, ctrl.signal);
    // No vi.advanceTimersByTime — rejection must not wait for the delay
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
