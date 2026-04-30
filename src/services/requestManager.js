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
 *     │                                  (5s)
 *     │                                    ▼
 *   (probe ok) ◄── HALF_OPEN ◄─────────── (timer)
 *                     │
 *               (probe fails)
 *                     │
 *                     └──► OPEN (reset 5s timer)
 */

import { delay } from '../utils/delay';

// Circuit breaker constants
const CB_FAILURE_THRESHOLD = 5;   // consecutive failures to trip breaker
const CB_OPEN_DURATION_MS  = 5000; // time OPEN before moving to HALF_OPEN

// Dynamic concurrency constants
const DC_WINDOW_SIZE       = 10;  // sliding window size (requests)
const DC_ERROR_THRESHOLD   = 0.3; // error rate above this triggers step-down
const DC_STEP_UP_AFTER     = 20;  // consecutive successes before step-up
const DC_COOLDOWN_STEP_MS  = 50;  // ms added to batchCooldownMs on step-down
const DC_MAX_COOLDOWN_MS   = 1000;

export class RequestManager {
  constructor({ minGapMs, maxConcurrent, batchCooldownMs }) {
    this._minGapMs        = minGapMs;
    this._maxConcurrent   = maxConcurrent;
    this._configuredMax   = maxConcurrent;
    this._batchCooldownMs = batchCooldownMs;

    // Rate limiting (global throttle queue — same pattern as old requestQueue)
    this._lastRequestTime = 0;
    this._requestQueue    = Promise.resolve();

    // In-flight dedup (keyed by URL)
    this._pendingFetches  = new Map();

    // ── Circuit breaker ────────────────────────────────────────────────────
    this._cbState              = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this._cbConsecutiveFails   = 0;
    this._cbOpenTimer          = null;
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

  // ── Throttled fetch with circuit breaker ──────────────────────────────────

  async fetch(url, signal) {
    // Fast-fail if breaker is OPEN
    if (this._cbState === 'OPEN') {
      throw new DOMException('Circuit breaker open — request rejected', 'AbortError');
    }

    // HALF_OPEN: only one probe goes through; all others queue
    if (this._cbState === 'HALF_OPEN') {
      if (this._cbProbeInFlight) {
        return new Promise((resolve, reject) => {
          this._cbPendingResolvers.push({ resolve, reject, url, signal });
        });
      }
      this._cbProbeInFlight = true;
    }

    // Enforce gap between dispatches only — not between completions.
    // _requestQueue resolves as soon as the gap elapses so the next request
    // can be dispatched concurrently rather than waiting for the HTTP response.
    const dispatchReady = this._requestQueue.then(async () => {
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
      // Network / abort error
      if (err.name !== 'AbortError') this.recordResult(false);
      if (this._cbState === 'HALF_OPEN') this._reopenBreaker();
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
    }, CB_OPEN_DURATION_MS);
  }

  _closeBreaker() {
    this._cbState             = 'CLOSED';
    this._cbProbeInFlight     = false;
    this._cbConsecutiveFails  = 0;
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
    // HALF_OPEN probe failed — go back to OPEN, reject all queued callers
    clearTimeout(this._cbOpenTimer);
    this._cbState         = 'OPEN';
    this._cbProbeInFlight = false;

    const pending = this._cbPendingResolvers.splice(0);
    for (const { reject } of pending) {
      reject(new DOMException('Circuit breaker open — request rejected', 'AbortError'));
    }

    this._cbOpenTimer = setTimeout(() => {
      this._cbState         = 'HALF_OPEN';
      this._cbProbeInFlight = false;
    }, CB_OPEN_DURATION_MS);
  }
}

// Singleton — shared across both contexts (first-come-first-served, no priority queue)
import {
  MIN_REQUEST_GAP_MS,
  MAX_CONCURRENT_REQUESTS,
  BATCH_COOLDOWN_MS,
} from '../utils/constants';

export const requestManager = new RequestManager({
  minGapMs:       MIN_REQUEST_GAP_MS,
  maxConcurrent:  MAX_CONCURRENT_REQUESTS,
  batchCooldownMs: BATCH_COOLDOWN_MS,
});
