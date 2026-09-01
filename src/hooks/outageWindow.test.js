import { describe, it, expect, vi, afterEach } from 'vitest';
import { isOutageWindow, recordOutageAttempt, NO_OUTAGE, OUTAGE_MAX_RETRIES } from './outageWindow';

const window_ = (n, { kept = 0, errors = 0, network = 0 } = {}) => ({
  artworks: Array.from({ length: kept }, (_, i) => ({ objectID: i })),
  outcomes: new Map(Array.from({ length: n }, (_, i) => [i, 'invalid'])),
  networkCount: network,
  errorCount: errors,
});

describe('isOutageWindow', () => {
  it('needs zero kept artworks and errors as the majority of what hit the network', () => {
    expect(isOutageWindow(window_(12, { errors: 6, network: 8 }))).toBe(true);
    expect(isOutageWindow(window_(12, { errors: 4, network: 8 }))).toBe(false);
    expect(isOutageWindow(window_(12, { kept: 1, errors: 8, network: 8 }))).toBe(false);
  });

  it('a lone error among cached rejects is a blip, not an outage', () => {
    expect(isOutageWindow(window_(12, { errors: 1, network: 1 }))).toBe(false);
  });

  it('a one-id window can register with its single error', () => {
    expect(isOutageWindow(window_(1, { errors: 1, network: 1 }))).toBe(true);
  });
});

describe('recordOutageAttempt', () => {
  afterEach(() => vi.restoreAllMocks());

  it('surfaces the first OUTAGE_MAX_RETRIES attempts at one window, then scans past', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = { current: NO_OUTAGE() };
    for (let i = 0; i < OUTAGE_MAX_RETRIES; i++) expect(recordOutageAttempt(ref, 40)).toBe(true);
    expect(recordOutageAttempt(ref, 40)).toBe(false);
    expect(ref.current).toEqual(NO_OUTAGE());
  });

  it('a different window starts its own count', () => {
    const ref = { current: { index: 40, count: OUTAGE_MAX_RETRIES } };
    expect(recordOutageAttempt(ref, 52)).toBe(true);
    expect(ref.current).toEqual({ index: 52, count: 1 });
  });
});
