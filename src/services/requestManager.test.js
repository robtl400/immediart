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

  it('transitions OPEN → HALF_OPEN after the open duration (60s base)', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    expect(rm.state).toBe('OPEN');

    // Grounded by API-FINDINGS.md: the measured penalty is ~56-62s, so the
    // breaker must NOT probe early (a 59s probe is a guaranteed 403).
    await vi.advanceTimersByTimeAsync(59_000);
    expect(rm.state).toBe('OPEN');
    await vi.advanceTimersByTimeAsync(1_000);
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

    const [, queued] = await Promise.all([probePromise, queuedPromise]);
    // Probe itself returns the 403 response (not an error) — but breaker re-opens
    expect(rm.state).toBe('OPEN');
    // Queued caller was rejected when breaker re-opened
    expect(queued).toBe('queued-rejected');
  });

  it('probe abort: stays HALF_OPEN (not OPEN); next successful fetch closes the breaker', async () => {
    // Regression: an aborted probe says nothing about API health — it must
    // release the probe slot and keep the breaker HALF_OPEN, not re-open it.
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    await vi.runAllTimersAsync(); // → HALF_OPEN
    expect(rm.state).toBe('HALF_OPEN');

    // Probe aborts mid-flight
    globalThis.fetch.mockImplementationOnce(() =>
      Promise.reject(new DOMException('Aborted', 'AbortError'))
    );
    await expect(rm.fetch('http://probe', null)).rejects.toMatchObject({ name: 'AbortError' });
    expect(rm.state).toBe('HALF_OPEN');

    // Next call becomes the new probe — success closes the breaker
    globalThis.fetch.mockImplementationOnce(ok200);
    const res = await rm.fetch('http://probe2', null);
    expect(res.status).toBe(200);
    expect(rm.state).toBe('CLOSED');
  });

  it('probe abort: promotes the next queued caller as the new probe', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    await vi.runAllTimersAsync(); // → HALF_OPEN

    // Probe stalls; a second caller queues behind it
    let rejectProbe;
    globalThis.fetch
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectProbe = reject; }))
      .mockImplementationOnce(ok200); // promoted queued caller succeeds

    const probePromise  = rm.fetch('http://probe', null).catch(e => e.name);
    const queuedPromise = rm.fetch('http://queued', null);

    await vi.runAllTimersAsync(); // let the probe dispatch so rejectProbe is assigned
    rejectProbe(new DOMException('Aborted', 'AbortError'));

    expect(await probePromise).toBe('AbortError');
    const queuedRes = await queuedPromise;
    expect(queuedRes.status).toBe(200);
    expect(rm.state).toBe('CLOSED');
  });

  it('probe abort: rejects already-aborted queued callers and promotes the next live one', async () => {
    // Batch fetches share one AbortController — a navigate-away can abort the
    // probe and queued callers together. The promotion loop must skip past
    // (and reject) aborted entries rather than stranding the live ones.
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    await vi.runAllTimersAsync(); // → HALF_OPEN

    let rejectProbe;
    globalThis.fetch
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectProbe = reject; }))
      .mockImplementationOnce(ok200); // promoted LIVE queued caller succeeds

    const probePromise = rm.fetch('http://probe', null).catch(e => e.name);

    // Caller whose signal is already aborted at arrival — the abort event
    // never fires again, so the pre-queue guard must reject it immediately
    // (the promotion loop's aborted-entry check is the defensive backstop)
    const abortedCtrl = new AbortController();
    abortedCtrl.abort();
    const abortedQueuedPromise = rm.fetch('http://aborted-queued', abortedCtrl.signal).catch(e => e.name);

    // Live queued caller behind the aborted one
    const liveQueuedPromise = rm.fetch('http://live-queued', null);

    await vi.runAllTimersAsync(); // let the probe dispatch so rejectProbe is assigned
    rejectProbe(new DOMException('Aborted', 'AbortError'));

    expect(await probePromise).toBe('AbortError');
    // Aborted queued caller rejected with AbortError, never dispatched
    expect(await abortedQueuedPromise).toBe('AbortError');
    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urls).not.toContain('http://aborted-queued');

    // Live queued caller was promoted to probe — success closes the breaker
    const liveRes = await liveQueuedPromise;
    expect(liveRes.status).toBe(200);
    expect(urls.concat(globalThis.fetch.mock.calls.map(c => c[0]))).toContain('http://live-queued');
    expect(rm.state).toBe('CLOSED');
  });

  it('a queued caller whose signal aborts WHILE queued rejects immediately', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch {}
    }
    await vi.runAllTimersAsync(); // → HALF_OPEN

    // Probe hangs forever — the breaker never resolves during this test
    globalThis.fetch.mockImplementationOnce(() => new Promise(() => {}));
    rm.fetch('http://probe', null).catch(() => {}); // hangs; silence rejection

    const ctrl = new AbortController();
    const queuedPromise = rm.fetch('http://queued', ctrl.signal);
    await vi.runAllTimersAsync(); // let the probe dispatch

    const callsBefore = globalThis.fetch.mock.calls.length;
    ctrl.abort();

    // Rejects right away — no waiting on probe/breaker resolution
    await expect(queuedPromise).rejects.toMatchObject({ name: 'AbortError' });
    // No fetch was ever dispatched for the queued caller
    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore);
    expect(globalThis.fetch.mock.calls.map(c => c[0])).not.toContain('http://queued');
    expect(rm.state).toBe('HALF_OPEN');
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

// ─── circuit breaker: OPEN duration escalation ────────────────────────────────
//
// Grounded by scripts/API-FINDINGS.md: the measured Imperva penalty is ~56-62s.
// Each failed HALF_OPEN probe means the ban outlasted the wait, so the OPEN
// period doubles (capped at 240s); a successful close resets it to base.

describe('RequestManager — OPEN duration escalation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const tripBreaker = async (rm) => {
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch(`http://trip-${i}`, null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('OPEN');
  };

  it('doubles the OPEN period after a failed probe, and resets on close', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    await tripBreaker(rm);

    // Base period: 60s → HALF_OPEN
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rm.state).toBe('HALF_OPEN');

    // Failed probe → OPEN again, now for 120s
    await rm.fetch('http://probe-1', null);
    expect(rm.state).toBe('OPEN');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rm.state).toBe('OPEN'); // 60s is no longer enough
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rm.state).toBe('HALF_OPEN');

    // Successful probe closes AND resets the escalation
    globalThis.fetch.mockImplementation(ok200);
    await rm.fetch('http://probe-2', null);
    expect(rm.state).toBe('CLOSED');

    // A fresh trip is back to the 60s base
    globalThis.fetch.mockImplementation(err403);
    await tripBreaker(rm);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rm.state).toBe('HALF_OPEN');
  });

  it('escalation caps at 240s', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    await tripBreaker(rm);

    await vi.advanceTimersByTimeAsync(60_000);   // → HALF_OPEN
    await rm.fetch('http://p1', null);           // fail → OPEN @ 120s
    await vi.advanceTimersByTimeAsync(120_000);  // → HALF_OPEN
    await rm.fetch('http://p2', null);           // fail → OPEN @ 240s
    await vi.advanceTimersByTimeAsync(240_000);  // → HALF_OPEN
    await rm.fetch('http://p3', null);           // fail → OPEN, capped @ 240s
    expect(rm.state).toBe('OPEN');
    await vi.advanceTimersByTimeAsync(240_000);
    expect(rm.state).toBe('HALF_OPEN');          // not 480s
  });
});

// ─── rolling request budget (token bucket) ────────────────────────────────────
//
// The Met's Imperva layer bans on cumulative volume (~100 requests/window
// measured). The budget queues dispatches past the limit until the oldest
// request ages out of the window, instead of walking into a ~60s ban.

describe('RequestManager — rolling request budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('dispatches up to the budget, then queues until the window slides', async () => {
    globalThis.fetch.mockImplementation(ok200);
    const rm = makeManager({ requestBudget: 3, requestBudgetWindowMs: 1000 });

    await rm.fetch('http://a', null);
    await rm.fetch('http://b', null);
    await rm.fetch('http://c', null);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    // 4th exceeds the budget — must wait for the window to slide
    let done = false;
    const fourth = rm.fetch('http://d', null).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(600);
    await fourth;
    expect(done).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('default budget (Infinity) never queues', async () => {
    globalThis.fetch.mockImplementation(ok200);
    const rm = makeManager();
    for (let i = 0; i < 10; i++) {
      await rm.fetch(`http://u${i}`, null);
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(10);
  });
});

// ─── reportBlockPage ──────────────────────────────────────────────────────────
//
// A 200-status Imperva block page is definitive ban evidence, but the
// transport layer records the 200 as a success (resetting the consecutive
// counter — and in HALF_OPEN, closing the breaker). reportBlockPage must trip
// the breaker immediately, from any non-OPEN state.

describe('RequestManager — reportBlockPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('trips the breaker from CLOSED on a single block page', () => {
    const rm = makeManager();
    expect(rm.state).toBe('CLOSED');
    rm.reportBlockPage();
    expect(rm.state).toBe('OPEN');
  });

  it('re-trips after a block-page probe wrongly closed the breaker (bounce)', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    await vi.runAllTimersAsync(); // → HALF_OPEN

    // The probe returns a 200-status block page: transport sees a success and
    // closes the breaker...
    globalThis.fetch.mockImplementationOnce(ok200);
    await rm.fetch('http://probe', null);
    expect(rm.state).toBe('CLOSED');

    // ...then the body parse (metAPI layer) discovers the block page
    rm.reportBlockPage();
    expect(rm.state).toBe('OPEN');
  });
});

// ─── budget: aborted callers ──────────────────────────────────────────────────

describe('RequestManager — budget ignores aborted callers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('an already-aborted caller spends no budget token and does not wait', async () => {
    globalThis.fetch.mockImplementation((url, { signal } = {}) => {
      if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      return ok200();
    });
    const rm = makeManager({ requestBudget: 1, requestBudgetWindowMs: 60_000 });

    await rm.fetch('http://a', null); // spends the only token

    // Aborted caller: with a token spent it would otherwise queue for 60s —
    // it must instead reject immediately without consuming budget.
    const controller = new AbortController();
    controller.abort();
    await expect(rm.fetch('http://b', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // a + b's immediate rejection
  });
});
