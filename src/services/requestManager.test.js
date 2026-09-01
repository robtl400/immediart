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
import { RequestManager, RECONNECT_GRACE_MS } from './requestManager';

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

// ─── offline: a dead network says nothing about the API ──────────────────────

describe('RequestManager — offline failures and reconnect()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('network errors while navigator.onLine is false do not count toward the breaker', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: false });
    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const rm = makeManager();
    for (let i = 0; i < 8; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('CLOSED'); // eight offline failures, no trip
  });

  it('the same failures while online still trip the breaker', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: true });
    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('OPEN');
  });

  it('reconnect() moves an OPEN breaker to HALF_OPEN — one probe decides, escalation intact', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('OPEN');
    await expect(rm.fetch('http://x', null)).rejects.toThrow('Circuit breaker open');

    rm.reconnect();
    expect(rm.state).toBe('HALF_OPEN'); // not CLOSED: `online` is not proof a ban lifted

    // The probe succeeds (the trip was a dead network) → CLOSED
    globalThis.fetch.mockImplementation(ok200);
    const res = await rm.fetch('http://x', null);
    expect(res.status).toBe(200);
    expect(rm.state).toBe('CLOSED');
  });

  it('a real ban survives reconnect(): the single probe 403s and the breaker re-opens, escalated', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    rm.reconnect();
    expect(rm.state).toBe('HALF_OPEN');
    await rm.fetch('http://x', null); // the probe: still 403
    expect(rm.state).toBe('OPEN');
    expect(globalThis.fetch).toHaveBeenCalledTimes(6); // exactly one probe hit the live ban
    // Escalated wait: still OPEN after the base period, HALF_OPEN after the doubled one
    await vi.advanceTimersByTimeAsync(60000);
    expect(rm.state).toBe('OPEN');
    await vi.advanceTimersByTimeAsync(60000);
    expect(rm.state).toBe('HALF_OPEN');
  });

  it('reconnect() while HALF_OPEN leaves the running probe in charge', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    await vi.advanceTimersByTimeAsync(60000); // OPEN → HALF_OPEN
    expect(rm.state).toBe('HALF_OPEN');
    rm.reconnect();
    expect(rm.state).toBe('HALF_OPEN');
  });

  it('failures in the first seconds after reconnect() do not count (the network is still settling)', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: true });
    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const rm = makeManager();
    rm.reconnect();
    for (let i = 0; i < 8; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('CLOSED');
    // Once the grace window has passed, failures count again
    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS + 1);
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('OPEN');
  });
});

// ─── budget persistence, gate re-checks, degraded responses, throttle getters ──

describe('RequestManager — budget persistence and gate re-checks', () => {
  const KEY = 'test_dispatch_times';
  // A Map-backed Storage stand-in: this file runs without a DOM, and Node's
  // own experimental localStorage is not a usable Storage without a flag.
  const memoryStorage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(ok200));
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a bucket persisted by a previous page load (or another tab) counts against this one', async () => {
    // Two dispatches a second ago, budget of two: the next request must wait
    // for the window to slide, not start a fresh bucket.
    localStorage.setItem(KEY, JSON.stringify([Date.now() - 1000, Date.now() - 900]));
    const rm = makeManager({ requestBudget: 2, requestBudgetWindowMs: 10000, persistKey: KEY });
    const p = rm.fetch('http://x', null);
    await vi.advanceTimersByTimeAsync(8000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1100);
    await p;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('writes every dispatch back so a reload inherits the bucket', async () => {
    const rm = makeManager({ requestBudget: 5, requestBudgetWindowMs: 10000, persistKey: KEY });
    await rm.fetch('http://a', null);
    await rm.fetch('http://b', null);
    expect(JSON.parse(localStorage.getItem(KEY))).toHaveLength(2);
    expect(rm.budgetWaitMs).toBe(0);
  });

  it('sees another tab\'s spending before its own first dispatch (storage is re-read at the gate)', async () => {
    const rm = makeManager({ requestBudget: 2, requestBudgetWindowMs: 10000, persistKey: KEY });
    expect(rm.budgetWaitMs).toBe(0);
    // Another tab spends the whole bucket after this manager was constructed
    localStorage.setItem(KEY, JSON.stringify([Date.now() - 500, Date.now() - 400]));
    expect(rm.budgetWaitMs).toBeGreaterThan(9000);
    const p = rm.fetch('http://x', null);
    await vi.advanceTimersByTimeAsync(9000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    await p;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('a corrupt stored value reads as empty and is repaired by the next save', async () => {
    localStorage.setItem(KEY, '{"not":"an array"}');
    const rm = makeManager({ requestBudget: 5, requestBudgetWindowMs: 10000, persistKey: KEY });
    await rm.fetch('http://x', null);
    expect(JSON.parse(localStorage.getItem(KEY))).toHaveLength(1);
  });

  it('a caller aborted during the budget wait leaves the queue at once and spends no token', async () => {
    const rm = makeManager({ requestBudget: 1, requestBudgetWindowMs: 10000 });
    await rm.fetch('http://first', null); // spends the one token
    const ctrl = new AbortController();
    const waiting = rm.fetch('http://second', ctrl.signal);
    waiting.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    ctrl.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // The token it never took is still the only one spent
    await vi.advanceTimersByTimeAsync(10000);
    expect(rm.budgetWaitMs).toBe(0);
  });

  it('a breaker that trips during the budget wait is not walked into', async () => {
    const rm = makeManager({ requestBudget: 1, requestBudgetWindowMs: 10000 });
    await rm.fetch('http://first', null);
    const waiting = rm.fetch('http://second', null);
    waiting.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    rm.reportBlockPage(); // a block page arrived meanwhile → OPEN
    expect(rm.state).toBe('OPEN');
    await vi.advanceTimersByTimeAsync(10000); // the window slides — the waiter wakes
    await expect(waiting).rejects.toThrow('Circuit breaker open');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // it never dispatched into the ban
  });
});

describe('RequestManager — 429/5xx are strain, not a ban', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const withHeaders = (status, headers = {}) => () =>
    Promise.resolve({ status, headers: { get: (h) => headers[h.toLowerCase()] ?? null } });

  it('a run of 503s steps concurrency down but never trips the breaker', async () => {
    globalThis.fetch.mockImplementation(withHeaders(503));
    const rm = makeManager({ maxConcurrent: 4 });
    for (let i = 0; i < 10; i++) await rm.fetch('http://x', null);
    expect(rm.maxConcurrent).toBeLessThan(4);
    expect(rm.state).toBe('CLOSED');
  });

  it('honours Retry-After on a 429: the next dispatch waits, and the wait is visible', async () => {
    globalThis.fetch.mockImplementationOnce(withHeaders(429, { 'retry-after': '5' })).mockImplementation(ok200);
    const rm = makeManager();
    await rm.fetch('http://x', null);
    expect(rm.budgetWaitMs).toBeGreaterThan(4900);
    expect(rm.budgetWaitMs).toBeLessThanOrEqual(5000);
    const p = rm.fetch('http://y', null);
    await vi.advanceTimersByTimeAsync(4900);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(rm.state).toBe('CLOSED');
  });

  it('caps an absurd Retry-After at one minute', async () => {
    globalThis.fetch.mockImplementationOnce(withHeaders(503, { 'retry-after': '86400' }));
    const rm = makeManager();
    await rm.fetch('http://x', null);
    expect(rm.budgetWaitMs).toBeLessThanOrEqual(60000);
  });

  it('retryAfterMs counts down the OPEN period and is 0 once HALF_OPEN', async () => {
    globalThis.fetch.mockImplementation(err403);
    const rm = makeManager();
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('OPEN');
    expect(rm.retryAfterMs).toBeGreaterThan(59000);
    await vi.advanceTimersByTimeAsync(30000);
    expect(rm.retryAfterMs).toBeGreaterThan(29000);
    expect(rm.retryAfterMs).toBeLessThanOrEqual(30000);
    await vi.advanceTimersByTimeAsync(30000);
    expect(rm.state).toBe('HALF_OPEN');
    expect(rm.retryAfterMs).toBe(0);
  });
});

// ─── storage failure, offline, breaker persistence, HALF_OPEN waiters ─────────

describe('RequestManager — bucket survives storage failure and offline', () => {
  const KEY = 'test_dispatch_times';
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(ok200));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps counting in memory when localStorage is absent', async () => {
    vi.stubGlobal('localStorage', undefined);
    const rm = makeManager({ requestBudget: 2, requestBudgetWindowMs: 10000, persistKey: KEY });
    await rm.fetch('http://a', null);
    await rm.fetch('http://b', null);
    expect(rm.budgetWaitMs).toBeGreaterThan(0); // both dispatches still count
    const p = rm.fetch('http://c', null);
    await vi.advanceTimersByTimeAsync(9000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1100);
    await p;
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('keeps counting in memory when setItem throws (quota, private mode)', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    const rm = makeManager({ requestBudget: 2, requestBudgetWindowMs: 10000, persistKey: KEY });
    await rm.fetch('http://a', null);
    await rm.fetch('http://b', null);
    expect(rm.budgetWaitMs).toBeGreaterThan(0);
  });

  it('spends no token on a dispatch the browser will refuse offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    globalThis.fetch.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const rm = makeManager({ requestBudget: 2, requestBudgetWindowMs: 10000 });
    for (let i = 0; i < 4; i++) {
      try { await rm.fetch(`http://x${i}`, null); } catch { /* expected */ }
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(4); // never queued behind the budget
    expect(rm.budgetWaitMs).toBe(0);
  });
});

describe('RequestManager — breaker state persists across a reload', () => {
  const KEY = 'test_dispatch_times';
  const memoryStorage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a new manager starts OPEN for the remainder of a persisted OPEN period', async () => {
    globalThis.fetch.mockImplementation(err403);
    const a = makeManager({ persistKey: KEY });
    for (let i = 0; i < 5; i++) {
      try { await a.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(a.state).toBe('OPEN');
    await vi.advanceTimersByTimeAsync(20000);

    const b = makeManager({ persistKey: KEY }); // the reload
    expect(b.state).toBe('OPEN');
    expect(b.retryAfterMs).toBeGreaterThan(39000);
    expect(b.retryAfterMs).toBeLessThanOrEqual(40000);
    await expect(b.fetch('http://y', null)).rejects.toThrow(/circuit breaker/i);
    await vi.advanceTimersByTimeAsync(40000);
    expect(b.state).toBe('HALF_OPEN');
  });

  it('a new manager honours a persisted Retry-After hold', async () => {
    globalThis.fetch.mockImplementation(() => Promise.resolve({ status: 429, headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '30' : null) } }));
    const a = makeManager({ persistKey: KEY });
    await a.fetch('http://x', null);
    expect(a.budgetWaitMs).toBeGreaterThan(29000);
    const b = makeManager({ persistKey: KEY });
    expect(b.budgetWaitMs).toBeGreaterThan(29000);
  });

  it('a closed breaker leaves nothing to restore', async () => {
    globalThis.fetch.mockImplementation(ok200);
    const a = makeManager({ persistKey: KEY });
    await a.fetch('http://x', null);
    const b = makeManager({ persistKey: KEY });
    expect(b.state).toBe('CLOSED');
    expect(b.retryAfterMs).toBe(0);
  });
});

describe('RequestManager — HALF_OPEN after a wait, and trips with queued callers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Trip the breaker with five straight 403s.
  async function trip(rm) {
    globalThis.fetch.mockImplementation(err403);
    for (let i = 0; i < 5; i++) {
      try { await rm.fetch('http://x', null); } catch { /* expected */ }
    }
    expect(rm.state).toBe('OPEN');
  }

  it('waiters that wake into HALF_OPEN follow the single-probe rule', async () => {
    const rm = makeManager({ requestBudget: 2, requestBudgetWindowMs: 70000 });
    globalThis.fetch.mockImplementation(ok200);
    await rm.fetch('http://warm1', null); // spend both tokens
    await rm.fetch('http://warm2', null);

    let resolveProbe;
    globalThis.fetch
      .mockImplementationOnce(() => new Promise(r => { resolveProbe = r; }))
      .mockImplementation(ok200);
    const first  = rm.fetch('http://a', null); // both queue on the budget
    const second = rm.fetch('http://b', null);
    second.catch(() => {});
    rm.reportBlockPage();                // OPEN for 60s; the budget clears at 70s
    expect(rm.state).toBe('OPEN');

    await vi.advanceTimersByTimeAsync(70100); // both wake in HALF_OPEN
    expect(rm.state).toBe('HALF_OPEN');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // two warm-ups + one probe
    await expect(second).rejects.toThrow(/circuit breaker/i); // not a second probe

    resolveProbe({ status: 200 });
    await first;
    expect(rm.state).toBe('CLOSED');
  });

  it('a block page right after a probe closed the breaker reopens it escalated', async () => {
    const rm = makeManager();
    await trip(rm);
    await vi.advanceTimersByTimeAsync(60000);
    expect(rm.state).toBe('HALF_OPEN');

    globalThis.fetch.mockImplementation(ok200);
    await rm.fetch('http://probe', null); // a 200 whose body is the block page
    expect(rm.state).toBe('CLOSED');
    rm.reportBlockPage();
    expect(rm.state).toBe('OPEN');
    await vi.advanceTimersByTimeAsync(60000);
    expect(rm.state).toBe('OPEN');       // 120s, not the 60s a fresh trip would give
    await vi.advanceTimersByTimeAsync(60000);
    expect(rm.state).toBe('HALF_OPEN');
  });

  it('a trip while callers wait behind a probe rejects them instead of stranding them', async () => {
    const rm = makeManager();
    await trip(rm);
    await vi.advanceTimersByTimeAsync(60000);
    expect(rm.state).toBe('HALF_OPEN');

    globalThis.fetch.mockImplementationOnce(() => new Promise(() => {})); // probe never settles
    rm.fetch('http://probe', null).catch(() => {});
    const queued = rm.fetch('http://queued', null);
    rm.reportBlockPage(); // a block page seen elsewhere trips it mid-probe
    await expect(queued).rejects.toThrow(/circuit breaker/i);
  });
});
