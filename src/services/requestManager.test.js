/**
 * RequestManager tests
 *
 * Covers: circuit breaker state machine (CLOSED → OPEN → HALF_OPEN → CLOSED),
 * HALF_OPEN probe failure (→ OPEN), dynamic concurrency step-down/step-up,
 * sliding window ring buffer wrap-around, and in-flight dedup.
 *
 * Pattern:
 *   vi.useFakeTimers() for circuit breaker timeout tests.
 *   globalThis.fetch mocked per test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestManager } from './requestManager';

// ─── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_OPTS = { minGapMs: 0, maxConcurrent: 4, batchCooldownMs: 250 };

const ok200 = () => Promise.resolve({ status: 200 });
const err403 = () => Promise.resolve({ status: 403 });
const netErr = () => Promise.reject(new TypeError('network'));

function makeManager(opts = {}) {
  return new RequestManager({ ...DEFAULT_OPTS, ...opts });
}

// ─── circuit breaker: CLOSED → OPEN ──────────────────────────────────────────

describe('RequestManager — circuit breaker CLOSED → OPEN', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts CLOSED', () => {
    const rm = makeManager();
    expect(rm.state).toBe('CLOSED');
  });

  it('trips to OPEN after 5 consecutive failures', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();

    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }

    expect(rm.state).toBe('OPEN');
  });

  it('does NOT trip before 5 consecutive failures', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();

    for (let i = 0; i < 4; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }

    expect(rm.state).toBe('CLOSED');
  });

  it('resets consecutive counter on success, requires 5 new failures to trip', async () => {
    const rm = makeManager();
    globalThis.fetch.mockImplementation(err403);

    for (let i = 0; i < 4; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    // One success resets consecutive failure counter
    globalThis.fetch.mockImplementationOnce(ok200);
    await rm.fetch('http://x', null);
    expect(rm.state).toBe('CLOSED');

    // Need 5 more failures to trip
    globalThis.fetch.mockImplementation(err403);
    for (let i = 0; i < 4; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    expect(rm.state).toBe('CLOSED');
    try { await rm.fetch('http://x', null); } catch {}
    expect(rm.state).toBe('OPEN');
  });

  it('OPEN state rejects requests immediately (fast-fail)', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    expect(rm.state).toBe('OPEN');

    // OPEN: should throw without calling fetch
    const callsBefore = globalThis.fetch.mock.calls.length;
    await expect(rm.fetch('http://x', null)).rejects.toThrow();
    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore);
  });
});

// ─── circuit breaker: OPEN → HALF_OPEN → CLOSED ──────────────────────────────

describe('RequestManager — OPEN → HALF_OPEN → CLOSED', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('transitions OPEN → HALF_OPEN after 5s', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    expect(rm.state).toBe('OPEN');

    await vi.runAllTimersAsync();
    expect(rm.state).toBe('HALF_OPEN');
  });

  it('probe success: transitions HALF_OPEN → CLOSED and releases queued callers', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    await vi.runAllTimersAsync(); // → HALF_OPEN

    // Next call is the probe — succeeds
    globalThis.fetch.mockImplementationOnce(ok200)  // probe
                    .mockImplementationOnce(ok200); // queued caller B

    // Call B queues behind the probe
    const probePromise = rm.fetch('http://probe', null);
    const queuedPromise = rm.fetch('http://queued', null);

    const [probeRes] = await Promise.all([probePromise, queuedPromise]);
    expect(probeRes.status).toBe(200);
    expect(rm.state).toBe('CLOSED');
  });

  it('probe failure: transitions HALF_OPEN → OPEN and rejects queued callers', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    await vi.runAllTimersAsync(); // → HALF_OPEN

    // Probe fails
    globalThis.fetch.mockImplementation(err403);

    const probePromise = rm.fetch('http://probe', null).catch(() => 'probe-rejected');
    const queuedPromise = rm.fetch('http://queued', null).catch(() => 'queued-rejected');

    const [probe, queued] = await Promise.all([probePromise, queuedPromise]);
    // Probe itself returns the 403 response (not an error) — but breaker re-opens
    expect(rm.state).toBe('OPEN');
    // Queued caller was rejected when breaker re-opened
    expect(queued).toBe('queued-rejected');
  });
});

// ─── dynamic concurrency ──────────────────────────────────────────────────────

describe('RequestManager — dynamic concurrency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('steps down maxConcurrent when error rate > 30% over 10 requests', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager({ maxConcurrent: 4 });

    // 4 failures out of 4 so far (no window full yet)
    for (let i = 0; i < 4; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    expect(rm.maxConcurrent).toBe(4); // window not full yet

    // Add 6 more failures to fill the 10-request window (4+6=10, 100% error rate)
    for (let i = 0; i < 6; i++) {
      try { await rm.fetch('http://x', null); } catch {}
      // Only 5 consecutive failures trip the breaker — reset between groups
      // Actually the breaker trips at 5, so let's work at low concurrency
    }
    // By now the circuit breaker would have tripped. Let's test step-down directly
    // via recordResult which is the public mechanism.
    const rm2 = makeManager({ maxConcurrent: 4 });
    for (let i = 0; i < 10; i++) rm2.recordResult(false); // 100% error rate
    expect(rm2.maxConcurrent).toBe(3); // stepped down by 1
  });

  it('increases batchCooldownMs on step-down', () => {
    const rm = makeManager({ maxConcurrent: 4, batchCooldownMs: 250 });
    for (let i = 0; i < 10; i++) rm.recordResult(false);
    expect(rm.batchCooldownMs).toBe(300); // 250 + 50
  });

  it('steps up maxConcurrent after 20 consecutive successes', () => {
    const rm = makeManager({ maxConcurrent: 4 });
    // Step down first
    for (let i = 0; i < 10; i++) rm.recordResult(false);
    expect(rm.maxConcurrent).toBe(3);

    // 20 consecutive successes → step up
    for (let i = 0; i < 20; i++) rm.recordResult(true);
    expect(rm.maxConcurrent).toBe(4);
  });

  it('step-up does not exceed configuredMax', () => {
    const rm = makeManager({ maxConcurrent: 4 });
    // Already at max — 20 successes should not go above 4
    for (let i = 0; i < 20; i++) rm.recordResult(true);
    expect(rm.maxConcurrent).toBe(4);
  });

  it('any failure resets the consecutive-success counter', () => {
    const rm = makeManager({ maxConcurrent: 4 });
    for (let i = 0; i < 10; i++) rm.recordResult(false); // step down to 3
    for (let i = 0; i < 19; i++) rm.recordResult(true);  // 19 successes
    rm.recordResult(false);                               // failure resets counter
    for (let i = 0; i < 19; i++) rm.recordResult(true);  // only 19 more
    expect(rm.maxConcurrent).toBe(3);                     // not stepped up yet
    rm.recordResult(true);                                // 20th success
    expect(rm.maxConcurrent).toBe(4);
  });

  it('sliding window ring buffer wraps correctly at size 10', () => {
    const rm = makeManager({ maxConcurrent: 4 });
    // Fill with 10 successes
    for (let i = 0; i < 10; i++) rm.recordResult(true);
    expect(rm.maxConcurrent).toBe(4); // no step-down

    // Now 10 failures overwrite the ring buffer — should step down
    for (let i = 0; i < 10; i++) rm.recordResult(false);
    expect(rm.maxConcurrent).toBe(3);
  });
});

// ─── in-flight dedup ─────────────────────────────────────────────────────────

describe('RequestManager — in-flight dedup (fetchDeduped)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('concurrent calls for the same URL share one underlying fetch', async () => {
    let resolveFirst;
    globalThis.fetch.mockReturnValueOnce(
      new Promise(res => { resolveFirst = () => res({ status: 200 }); })
    );

    const rm = makeManager();
    const p1 = rm.fetchDeduped('http://same', null);
    const p2 = rm.fetchDeduped('http://same', null);

    resolveFirst();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2); // same response object
  });

  it('different URLs get separate fetches', async () => {
    globalThis.fetch.mockImplementation(ok200);
    const rm = makeManager();

    await rm.fetchDeduped('http://a', null);
    await rm.fetchDeduped('http://b', null);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('after first fetch completes, same URL starts a new fetch', async () => {
    globalThis.fetch.mockImplementation(ok200);
    const rm = makeManager();

    await rm.fetchDeduped('http://same', null);
    await rm.fetchDeduped('http://same', null);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
