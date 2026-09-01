import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldPlaySplash, markSplashSeen, SPLASH_SEEN_KEY } from './splashGate';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe('splashGate', () => {
  beforeEach(() => vi.stubGlobal('sessionStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('plays on the feed at the start of a session', () => {
    expect(shouldPlaySplash('/')).toBe(true);
  });

  it('does not play on a deep link — the landing would not line up', () => {
    expect(shouldPlaySplash('/artwork/1')).toBe(false);
    expect(shouldPlaySplash('/liked')).toBe(false);
  });

  it('plays once per session: marking it seen stops it for later loads', () => {
    markSplashSeen();
    expect(sessionStorage.getItem(SPLASH_SEEN_KEY)).toBe('1');
    expect(shouldPlaySplash('/')).toBe(false);
  });

  it('still plays when session storage is unusable (private mode)', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } });
    expect(shouldPlaySplash('/')).toBe(true);
    expect(() => markSplashSeen()).not.toThrow();
  });
});
