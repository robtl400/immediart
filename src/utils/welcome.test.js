import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefersReducedMotion } from './welcome';

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true when the reduce media query matches', () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: q.includes('reduce'), media: q }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when the media query does not match', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false (never throws) when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
