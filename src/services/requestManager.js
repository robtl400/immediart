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

import { delay, delayOrAbort } from '../utils/delay';

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
export const RECONNECT_GRACE_MS = 3000; // failures this soon after `online` don't count (see reconnect)
const RETRY_AFTER_MAX_MS = 60000;       // longest server-requested hold we honour

// Dynamic concurrency constants
const DC_WINDOW_SIZE       = 10;  // sliding window size (requests)
const DC_ERROR_THRESHOLD   = 0.3; // error rate above this triggers step-down
const DC_STEP_UP_AFTER     = 20;  // consecutive successes before step-up
const DC_COOLDOWN_STEP_MS  = 50;  // ms added to batchCooldownMs on step-down
const DC_MAX_COOLDOWN_MS   = 1000;

export class RequestManager {
  constructor({ minGapMs, maxConcurrent, batchCooldownMs, requestBudget = Infinity, requestBudgetWindowMs = 30000, persistKey = null }) {
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
    // The bucket outlives the page: the Met counts every request from this
    // connection across reloads and tabs, so the timestamps persist (in
    // localStorage, merged across tabs) — otherwise a pull-to-refresh or a
    // second tab starts a fresh 60 while Imperva's window remembers.
    this._persistKey      = persistKey;
    this._dispatchTimes   = this._loadDispatchTimes();
    this._unsavedTimes    = []; // dispatches not yet merged into storage
    // Server-requested hold (Retry-After on a 429/503): nothing dispatches
    // before it lapses.
    this._holdUntil       = 0;

    // In-flight dedup (keyed by URL)
    this._pendingFetches  = new Map();

    // ── Circuit breaker ────────────────────────────────────────────────────
    this._cbState              = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this._cbConsecutiveFails   = 0;
    this._cbOpenTimer          = null;
    this._cbOpenUntil          = null;             // when the current OPEN period ends
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

  // ── Throttle visibility ───────────────────────────────────────────────────
  //
  // How long until the next request can go out, and why — so the UI can say
  // "resuming in Ns" instead of showing a dead spinner (budget) or a "Try
  // again" that fails on the spot (breaker).

  // Time until an OPEN breaker moves to HALF_OPEN (0 when not OPEN).
  get retryAfterMs() {
    if (this._cbState !== 'OPEN' || this._cbOpenUntil == null) return 0;
    return Math.max(0, this._cbOpenUntil - Date.now());
  }

  // Time the next dispatch would wait at the gate: a server-requested hold,
  // or the rolling budget being spent (0 when a request could go now).
  get budgetWaitMs() {
    this._syncDispatchTimes();
    const now = Date.now();
    let wait = Math.max(0, this._holdUntil - now);
    if (this._budget !== Infinity) {
      const live = this._dispatchTimes.filter(t => now - t < this._budgetWindowMs);
      if (live.length >= this._budget) wait = Math.max(wait, live[0] + this._budgetWindowMs - now);
    }
    return wait;
  }

  // ── Budget persistence ────────────────────────────────────────────────────

  // Timestamps stored for this bucket, filtered to the live window. A corrupt
  // value (anything but an array) reads as empty and is overwritten on the
  // next save rather than wedging persistence.
  _readStoredTimes() {
    if (!this._persistKey) return [];
    try {
      const parsed = JSON.parse(globalThis.localStorage?.getItem(this._persistKey) || '[]');
      const now = Date.now();
      return (Array.isArray(parsed) ? parsed : [])
        .filter(t => Number.isFinite(t) && t <= now && now - t < this._budgetWindowMs);
    } catch {
      return [];
    }
  }

  _loadDispatchTimes() {
    return this._readStoredTimes();
  }

  // Fold in what other tabs have dispatched since we last looked (no write).
  // Called before every gate decision so a second tab's spending counts here.
  _syncDispatchTimes() {
    if (!this._persistKey) return;
    const stored = this._readStoredTimes();
    if (stored.length === 0 && this._unsavedTimes.length === 0) return;
    this._dispatchTimes = [...stored, ...this._unsavedTimes].sort((a, b) => a - b);
  }

  _saveDispatchTimes() {
    if (!this._persistKey) return;
    try {
      // Merge with what other tabs wrote — the bucket is per connection, not
      // per tab — and fold their dispatches into this tab's view of it. Only
      // dispatches not yet written are appended (timestamps are not unique:
      // two requests can share a millisecond, and both must count). Two tabs
      // saving in the same instant can lose one entry to the read-modify-
      // write race; that costs a token against a 40-request safety margin
      // and is accepted rather than engineered around.
      const merged = [...this._readStoredTimes(), ...this._unsavedTimes].sort((a, b) => a - b);
      this._unsavedTimes = [];
      this._dispatchTimes = merged;
      globalThis.localStorage?.setItem(this._persistKey, JSON.stringify(merged));
    } catch {
      this._unsavedTimes = []; // storage unavailable — the in-memory bucket still applies
    }
  }

  // Honour a Retry-After header (seconds or an HTTP date) on a 429/503.
  _holdFor(response) {
    const header = response.headers?.get?.('retry-after');
    if (!header) return;
    let ms = Number(header) * 1000;
    if (!Number.isFinite(ms)) ms = Date.parse(header) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return;
    this._holdUntil = Math.max(this._holdUntil, Date.now() + Math.min(ms, RETRY_AFTER_MAX_MS));
  }

  // ── recordResult ─────────────────────────────────────────────────────────
  //
  // Called after every HTTP attempt (including retries) with ok=true/false.
  // ok=false means a 403 or network error — not a 404 or other status.
  //
  // Two independent tracking mechanisms:
  //   1. Sliding window  → dynamic concurrency adjustment
  //   2. Consecutive counter → circuit breaker trips

  recordResult(ok) {
    this._recordWindow(ok);
    this._recordBreaker(ok);
  }

  // 1+2: sliding window + step-up counter → dynamic concurrency. Fed by
  // every HTTP attempt AND by 429/5xx responses (the Met straining, which
  // the breaker deliberately ignores — see fetch()).
  _recordWindow(ok) {
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
  }

  // 3: consecutive-failure counter → circuit breaker. Only a 403 / block
  // page / counted network error reaches this — never a 429/5xx.
  _recordBreaker(ok) {
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

  // ── reconnect ─────────────────────────────────────────────────────────────
  //
  // The browser reports it is (back) online. The `online` event fires on any
  // interface change — a Wi-Fi switch, a VPN, a laptop wake — so it is NOT
  // proof the Met is reachable, and never proof that an Imperva ban has
  // lifted. So: don't close an OPEN breaker, let ONE probe decide. A breaker
  // tripped by a dead network clears on that probe's first success; a real
  // ban costs one request and re-opens with its escalation intact. A breaker
  // already HALF_OPEN has its probe mechanism running — leave it alone.
  //
  // Failures in the first moments after reconnecting are also discounted:
  // the interface comes up before DHCP/DNS settle (captive portals
  // especially), and six parallel fetches x three retries in that gap would
  // manufacture the exact self-inflicted 60s ban the offline rule prevents.

  reconnect() {
    this._onlineAt = Date.now();
    if (this._cbState === 'OPEN') {
      clearTimeout(this._cbOpenTimer);
      this._cbOpenUntil     = null;
      this._cbState         = 'HALF_OPEN';
      this._cbProbeInFlight = false;
    } else if (this._cbState === 'CLOSED') {
      this._cbConsecutiveFails = 0;
    }
  }

  get _settlingAfterReconnect() {
    return this._onlineAt != null && Date.now() - this._onlineAt < RECONNECT_GRACE_MS;
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
      // Wait out whichever applies — a server-requested hold (Retry-After on
      // a 429/503) or a spent budget — and loop, since either can arrive or
      // grow while the other is being waited out. Waits are abortable: a
      // caller whose view unmounted leaves the queue at once instead of
      // holding it (and a token) for nothing.
      for (;;) {
        const hold = this._holdUntil - Date.now();
        if (hold > 0) { await delayOrAbort(hold, signal); continue; }
        if (this._budget === Infinity) break;
        this._syncDispatchTimes();
        const now = Date.now();
        this._dispatchTimes = this._dispatchTimes.filter(t => now - t < this._budgetWindowMs);
        if (this._dispatchTimes.length < this._budget) break;
        await delayOrAbort(Math.max(1, this._dispatchTimes[0] + this._budgetWindowMs - now), signal);
      }

      // The waits are over, but the world may have moved on: a caller that
      // aborted meanwhile must not spend a token, and a breaker that tripped
      // meanwhile must not be walked into — dispatching into an active ban
      // is exactly what extends it.
      if (signal?.aborted) return;
      if (this._cbState === 'OPEN') throw new Error(CIRCUIT_BREAKER_OPEN);
      if (this._budget !== Infinity) {
        const t = Date.now();
        this._dispatchTimes.push(t);
        this._unsavedTimes.push(t);
        this._saveDispatchTimes();
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
      // Raised by the gate above (the breaker tripped during a wait): not a
      // network result, nothing to record.
      if (err.message === CIRCUIT_BREAKER_OPEN) throw err;
      // A failure while the browser reports no connection says nothing about
      // the API's health: it must not count toward the breaker, or a brief
      // Wi-Fi drop (six parallel fetches x three retries) trips a 60s ban of
      // our own making that outlasts the reconnect.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (err.name !== 'AbortError' && !offline && !this._settlingAfterReconnect) {
        // Network error — count it, and a failed HALF_OPEN probe re-opens the breaker
        this.recordResult(false);
        if (this._cbState === 'HALF_OPEN') this._reopenBreaker();
      } else if (isProbe && this._cbState === 'HALF_OPEN') {
        // An aborted (or offline) probe says nothing about API health —
        // release the probe slot and promote the next LIVE queued caller as
        // the new probe. Loop past aborted entries (batch fetches share one
        // AbortController, so a navigate-away can abort the probe and queued
        // callers together); stopping at the first aborted entry would strand
        // the rest.
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

    // 403 (and a block page, via reportBlockPage) is Imperva banning: it
    // feeds the breaker. 429/5xx is the Met straining: it steps concurrency
    // down and honours a Retry-After, but never trips the breaker — a 60s
    // self-imposed ban is not the right answer to a busy server.
    const status   = response.status;
    const banned   = status === 403;
    const degraded = status === 429 || status >= 500;
    if (banned) {
      this.recordResult(false);
    } else if (degraded) {
      this._recordWindow(false);
      this._holdFor(response);
    } else {
      this.recordResult(true);
    }
    const ok = !banned;

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
    this._cbOpenUntil = Date.now() + this._cbOpenDurationMs;
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
    this._cbOpenUntil         = null;
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

    this._cbOpenUntil = Date.now() + this._cbOpenDurationMs;
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
  persistKey:            'immediart_dispatch_times',
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => requestManager.reconnect());
}
