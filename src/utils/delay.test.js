/**
 * delay utility tests
 *
 * Covers: delay (resolves after ms), addJitter (adds noise in range),
 * delayOrAbort (resolves normally, rejects on abort signal).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { delay, addJitter, delayOrAbort } from './delay';

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
});
