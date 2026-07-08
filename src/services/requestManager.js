/**
 * RequestManager — centralised HTTP request throttling, deduplication,
 * dynamic concurrency, and circuit breaker.
 *
 * Replaces the module-level lastRequestTime / requestQueue / pendingFetches
 * pattern that was spread across metAPI.js.
 *
 * Circuit breaker states:
 *
 *   CLOSED ──(5 consecutive failures)──► OPEN
 *     ▲                                    │
 *     │                             (60s, escalating)
 *     │                                    ▼
 *   (probe ok) ◄── HALF_OPEN ◄─────────── (timer)
 *                     │
 *               (probe fails)
 *                     │
 *                     └──► OPEN (doubled timer, capped)
 */

import { delay } from '../utils/delay';

// Shared error message for the open-breaker fast-fail. Consumers match on
// this constant (not a retyped string) so a rewording can't silently break
// their error handling.
export const CIRCUIT_BREAKER_OPEN = 'Circuit breaker open';

// Circuit breaker constants
//
// OPEN duration is grounded by scripts/API-FINDINGS.md (measured 2026-07-07):
// the Met's Imperva throttle penalty lasts ~56-62s. The previous 5s value sent
// ~12 doomed probes into every real block; 60s lands the first probe roughly
// when the penalty lifts. A failed probe doubles the wait (120s, then 240s cap)
// in case the ban was extended; a successful close resets to the base.
const CB_FAILURE_THRESHOLD = 5;      // consecutive failures to trip breaker
const CB_OPEN_BASE_MS      = 60000;  // first OPEN period ≈ measured penalty
const CB_OPEN_MAX_MS       = 240000; // escalation ceiling

// Dynamic concurrency constants
const DC_WINDOW_SIZE       = 10;  // sliding window size (requests)
const DC_ERROR_THRESHOLD   = 0.3; // error rate above this triggers step-down
const DC_STEP_UP_AFTER     = 20;  // consecutive successes before step-up
const DC_COOLDOWN_STEP_MS  = 50;  // ms added to batchCooldownMs on step-down
const DC_MAX_COOLDOWN_MS   = 1000;

export class RequestManager {
  constructor({ minGapMs, maxConcurrent, batchCooldownMs, requestBudget = Infinity, requestBudgetWindowMs = 30000 }) {
    this._minGapMs        = minGapMs;
    this._maxConcurrent   = maxConcurrent;
    this._configuredMax   = maxConcurrent;
    this._batchCooldownMs = batchCooldownMs;

    // Rate limiting (global throttle queue — same pattern as old requestQueue)
    this._lastRequestTime = 0;
    this._requestQueue    = Promise.resolve();

    // Rolling request budget — the Met's Imperva layer bans on CUMULATIVE
    // volume in a window (~100 requests measured), not on concurrency or
    // instantaneous rate. Dispatch timestamps inside the window are tracked;
    // when the budget is spent, further dispatches wait for the oldest to
    // age out instead of walking into a ~60s ban.
    this._budget          = requestBudget;
    this._budgetWindowMs  = requestBudgetWindowMs;
    this._dispatchTimes   = [];

    // In-flight dedup (keyed by URL)
    this._pendingFetches  = new Map();

    // ── Circuit breaker ────────────────────────────────────────────────────
    this._cbState              = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this._cbConsecutiveFails   = 0;
    this._cbOpenTimer          = null;
    this._cbOpenDurationMs     = CB_OPEN_BASE_MS; // escalates on failed probes
    this._cbProbeInFlight      = false;
    this._cbPendingResolvers   = []; // { resolve, reject, url, signal }[]

    // ── Dynamic concurrency ───────────────────────────────────────────────
    // Sliding window ring buffer: true = success, false = failure, null = empty
    this._dcWindow             = new Array(DC_WINDOW_SIZE).fill(null);
    this._dcWindowIdx          = 0;
    this._dcWindowCount        = 0;
    this._dcConsecutiveSuccess = 0;
  }

  // ── Public getters ────────────────────────────────────────────────────────

  get maxConcurrent()      { return this._maxConcurrent; }
  set maxConcurrent(v)     { this._maxConcurrent = v; }

  get batchCooldownMs()    { return this._batchCooldownMs; }

  get state()              { return this._cbState; }

  // ── recordResult ─────────────────────────────────────────────────────────
  //
  // Called after every HTTP attempt (including retries) with ok=true/false.
  // ok=false means a 403 or network error — not a 404 or other status.
  //
  // Two independent tracking mechanisms:
  //   1. Sliding window  → dynamic concurrency adjustment
  //   2. Consecutive counter → circuit breaker trips

  recordResult(ok) {
    // 1. Sliding window (dynamic concurrency)
    this._dcWindow[this._dcWindowIdx] = ok;
    this._dcWindowIdx = (this._dcWindowIdx + 1) % DC_WINDOW_SIZE;
    if (this._dcWindowCount < DC_WINDOW_SIZE) this._dcWindowCount++;

    if (this._dcWindowCount >= DC_WINDOW_SIZE) {
      const errors     = this._dcWindow.filter(v => v === false).length;
      const errorRate  = errors / this._dcWindowCount;

      if (errorRate > DC_ERROR_THRESHOLD && this._maxConcurrent > 1) {
        // Step down — too many errors
        this._maxConcurrent   = Math.max(1, this._maxConcurrent - 1);
        this._batchCooldownMs = Math.min(DC_MAX_COOLDOWN_MS, this._batchCooldownMs + DC_COOLDOWN_STEP_MS);
        // Reset window so next evaluation starts fresh
        this._dcWindow.fill(null);
        this._dcWindowCount = 0;
        this._dcConsecutiveSuccess = 0;
      }
    }

    // 2. Consecutive success counter (step-up)
    if (ok) {
      this._dcConsecutiveSuccess++;
      if (this._dcConsecutiveSuccess >= DC_STEP_UP_AFTER &&
          this._maxConcurrent < this._configuredMax) {
        this._maxConcurrent++;
        this._dcConsecutiveSuccess = 0;
      }
    } else {
      this._dcConsecutiveSuccess = 0;
    }

    // 3. Circuit breaker consecutive-failure counter
    if (!ok) {
      this._cbConsecutiveFails++;
      if (this._cbConsecutiveFails >= CB_FAILURE_THRESHOLD &&
          this._cbState === 'CLOSED') {
        this._tripBreaker();
      }
    } else {
      this._cbConsecutiveFails = 0;
    }
  }

  // ── reportBlockPage ───────────────────────────────────────────────────────
  //
  // A 200-status Imperva block page (HTML body on a "successful" response) is
  // DEFINITIVE evidence of an active ban — it never happens in healthy
  // operation. It must trip the breaker immediately: the transport layer
  // already recorded the 200 as a success (resetting the consecutive-failure
  // counter, and in HALF_OPEN even closing the breaker), so waiting for
  // CB_FAILURE_THRESHOLD would never fire.

  reportBlockPage() {
    this.recordResult(false);
    if (this._cbState !== 'OPEN') this._tripBreaker();
  }

  // ── Throttled fetch with circuit breaker ──────────────────────────────────

  async fetch(url, signal) {
    // Fast-fail if breaker is OPEN
    if (this._cbState === 'OPEN') {
      throw new Error(CIRCUIT_BREAKER_OPEN);
    }

    // HALF_OPEN: only one probe goes through; all others queue
    let isProbe = false;
    if (this._cbState === 'HALF_OPEN') {
      if (this._cbProbeInFlight) {
        // A signal that aborted before we got here would never fire its
        // 'abort' event again — reject now rather than queueing a zombie.
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return new Promise((resolve, reject) => {
          const entry = { resolve, reject, url, signal };
          this._cbPendingResolvers.push(entry);
          // A queued caller must observe its own abort — otherwise callers
          // whose component unmounted pend until the breaker resolves (or
          // forever, if the probe hangs).
          signal?.addEventListener('abort', () => {
            const i = this._cbPendingResolvers.indexOf(entry);
            if (i !== -1) {
              this._cbPendingResolvers.splice(i, 1);
              reject(new DOMException('Aborted', 'AbortError'));
            }
          }, { once: true });
        });
      }
      this._cbProbeInFlight = true;
      isProbe = true;
    }

    // Enforce gap between dispatches only — not between completions.
    // _requestQueue resolves as soon as the gap elapses so the next request
    // can be dispatched concurrently rather than waiting for the HTTP response.
    const dispatchReady = this._requestQueue.then(async () => {
      // An already-aborted caller must not spend a budget token or hold the
      // serial queue through a budget wait — fall through; the fetch() below
      // rejects with AbortError on its own.
      if (signal?.aborted) return;

      // Budget gate first: this runs serially inside the dispatch queue, so a
      // waiter here blocks everything behind it — which is the point: once the
      // window's budget is spent, NOTHING dispatches until the oldest request
      // ages out. Callers whose signal aborts during the wait reject at the
      // fetch() below, immediately after their turn arrives.
      if (this._budget !== Infinity) {
        let now = Date.now();
        this._dispatchTimes = this._dispatchTimes.filter(t => now - t < this._budgetWindowMs);
        while (this._dispatchTimes.length >= this._budget) {
          await delay(Math.max(1, this._dispatchTimes[0] + this._budgetWindowMs - now));
          now = Date.now();
          this._dispatchTimes = this._dispatchTimes.filter(t => now - t < this._budgetWindowMs);
        }
        this._dispatchTimes.push(Date.now());
      }

      const now     = Date.now();
      const elapsed = now - this._lastRequestTime;
      if (elapsed < this._minGapMs) {
        await delay(this._minGapMs - elapsed);
      }
      this._lastRequestTime = Date.now();
    });
    this._requestQueue = dispatchReady.catch(() => {}); // prevent chain breakage
    const myRequest    = dispatchReady.then(() => globalThis.fetch(url, { signal }));

    let response;
    try {
      response = await myRequest;
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Network error — count it, and a failed HALF_OPEN probe re-opens the breaker
        this.recordResult(false);
        if (this._cbState === 'HALF_OPEN') this._reopenBreaker();
      } else if (isProbe && this._cbState === 'HALF_OPEN') {
        // An aborted probe says nothing about API health — release the probe
        // slot and promote the next LIVE queued caller as the new probe.
        // Loop past aborted entries (batch fetches share one AbortController,
        // so a navigate-away can abort the probe and queued callers together);
        // stopping at the first aborted entry would strand the rest.
        this._cbProbeInFlight = false;
        let next;
        while ((next = this._cbPendingResolvers.shift())) {
          if (next.signal?.aborted) {
            next.reject(new DOMException('Aborted', 'AbortError'));
            continue;
          }
          this.fetch(next.url, next.signal).then(next.resolve, next.reject);
          break;
        }
      }
      throw err;
    }

    const ok = response.status !== 403;
    this.recordResult(ok);

    if (this._cbState === 'HALF_OPEN') {
      if (ok) {
        this._closeBreaker();
      } else {
        this._reopenBreaker();
      }
    }

    return response;
  }

  // ── In-flight deduplication ───────────────────────────────────────────────
  //
  // If the same URL is already being fetched, return the same Promise.
  // Callers with different signals still share the same underlying fetch —
  // the first abort clears the entry, allowing the next caller a fresh fetch.

  fetchDeduped(url, signal) {
    if (this._pendingFetches.has(url)) {
      return this._pendingFetches.get(url);
    }

    const promise = this.fetch(url, signal).finally(() => {
      this._pendingFetches.delete(url);
    });

    this._pendingFetches.set(url, promise);
    signal?.addEventListener('abort', () => this._pendingFetches.delete(url), { once: true });
    return promise;
  }

  // ── Circuit breaker internals ─────────────────────────────────────────────

  _tripBreaker() {
    this._cbState         = 'OPEN';
    this._cbProbeInFlight = false;
    clearTimeout(this._cbOpenTimer);
    this._cbOpenTimer = setTimeout(() => {
      this._cbState         = 'HALF_OPEN';
      this._cbProbeInFlight = false;
    }, this._cbOpenDurationMs);
  }

  _closeBreaker() {
    this._cbState             = 'CLOSED';
    this._cbProbeInFlight     = false;
    this._cbConsecutiveFails  = 0;
    this._cbOpenDurationMs    = CB_OPEN_BASE_MS; // healthy again — reset escalation
    clearTimeout(this._cbOpenTimer);

    // Release all queued callers — they retry now that the breaker is CLOSED
    const pending = this._cbPendingResolvers.splice(0);
    for (const { resolve, reject, url, signal } of pending) {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
      } else {
        this.fetch(url, signal).then(resolve, reject);
      }
    }
  }

  _reopenBreaker() {
    // HALF_OPEN probe failed — the penalty outlasted the wait, so the ban may
    // have been extended. Double the OPEN period (capped) before re-probing,
    // go back to OPEN, and reject all queued callers.
    clearTimeout(this._cbOpenTimer);
    this._cbState          = 'OPEN';
    this._cbProbeInFlight  = false;
    this._cbOpenDurationMs = Math.min(CB_OPEN_MAX_MS, this._cbOpenDurationMs * 2);

    const pending = this._cbPendingResolvers.splice(0);
    for (const { reject } of pending) {
      reject(new Error(CIRCUIT_BREAKER_OPEN));
    }

    this._cbOpenTimer = setTimeout(() => {
      this._cbState         = 'HALF_OPEN';
      this._cbProbeInFlight = false;
    }, this._cbOpenDurationMs);
  }
}

// Singleton — shared across both contexts (first-come-first-served, no priority queue)
import {
  MIN_REQUEST_GAP_MS,
  MAX_CONCURRENT_REQUESTS,
  BATCH_COOLDOWN_MS,
  REQUEST_BUDGET,
  REQUEST_BUDGET_WINDOW_MS,
} from '../utils/constants';

export const requestManager = new RequestManager({
  minGapMs:        MIN_REQUEST_GAP_MS,
  maxConcurrent:   MAX_CONCURRENT_REQUESTS,
  batchCooldownMs: BATCH_COOLDOWN_MS,
  requestBudget:         REQUEST_BUDGET,
  requestBudgetWindowMs: REQUEST_BUDGET_WINDOW_MS,
});
