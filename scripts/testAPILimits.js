/**
 * testAPILimits.js — Empirical MET API throttle test
 *
 * DEV TOOL ONLY — not shipped in production.
 *
 * Measures the MET API's actual throttle limits:
 *   1. Sequential requests at varying intervals → finds the safe MIN_REQUEST_GAP_MS floor
 *   2. Concurrent batch sizes → finds the safe MAX_CONCURRENT_REQUESTS ceiling
 *   3. Circuit breaker recovery → how long after a 403 until requests succeed again
 *
 * Usage:
 *   node scripts/testAPILimits.js
 *
 * CAUTION: Keep total requests ≤ 30 to avoid triggering longer throttle windows.
 * Run ONCE before tuning constants in src/utils/constants.js. Do not run repeatedly.
 *
 * Results inform Phase 6 constants:
 *   MAX_CONCURRENT_REQUESTS, MIN_REQUEST_GAP_MS, BATCH_COOLDOWN_MS
 */

const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';

// A stable set of known-good MET object IDs for testing (public domain, always available)
const TEST_IDS = [
  436535, 437853, 436105, 436121, 437329, 459055, 436524,
  437980, 436528, 436530, 437881, 436944, 436947, 437123,
  437853, 436528,
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function probe(id) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/objects/${id}`);
    const latency = Date.now() - start;
    return { ok: res.status === 200, status: res.status, latency };
  } catch (err) {
    return { ok: false, status: 0, latency: Date.now() - start, error: err.message };
  }
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function fmt(rows) {
  const cols = Object.keys(rows[0]);
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c]).length)));
  const line = widths.map(w => '-'.repeat(w)).join('-+-');
  const header = cols.map((c, i) => c.padEnd(widths[i])).join(' | ');
  const body = rows.map(r => cols.map((c, i) => String(r[c]).padEnd(widths[i])).join(' | '));
  return [header, line, ...body].join('\n');
}

// ─── Phase 1: Sequential interval test ────────────────────────────────────────

async function testSequentialIntervals() {
  console.log('\n=== Phase 1: Sequential interval test ===');
  console.log('Sends 3 sequential requests at each gap size. Reports 403 rate.\n');

  const intervals = [10, 20, 40, 80, 160];
  const REPS = 3;
  const rows = [];

  for (const gap of intervals) {
    const results = [];
    for (let i = 0; i < REPS; i++) {
      if (i > 0) await sleep(gap);
      const id = TEST_IDS[i % TEST_IDS.length];
      results.push(await probe(id));
    }
    const successes = results.filter(r => r.ok).length;
    const latencies = results.filter(r => r.ok).map(r => r.latency);
    rows.push({
      gap_ms:       gap,
      requests:     REPS,
      successes,
      failures:     REPS - successes,
      success_rate: `${Math.round((successes / REPS) * 100)}%`,
      median_lat_ms: latencies.length ? median(latencies) : 'N/A',
    });

    // Pause between interval groups to avoid cumulative throttling
    await sleep(500);
  }

  console.log(fmt(rows));
  return rows;
}

// ─── Phase 2: Concurrent batch size test ──────────────────────────────────────

async function testConcurrentBatchSizes() {
  console.log('\n=== Phase 2: Concurrent batch size test ===');
  console.log('Fires N requests simultaneously. Reports 403 rate at each concurrency level.\n');

  const batchSizes = [2, 4, 6, 8];
  const rows = [];

  for (const size of batchSizes) {
    const ids = TEST_IDS.slice(0, size);
    const results = await Promise.all(ids.map(id => probe(id)));

    const successes = results.filter(r => r.ok).length;
    const latencies = results.filter(r => r.ok).map(r => r.latency);
    rows.push({
      batch_size:    size,
      successes,
      failures:      size - successes,
      success_rate:  `${Math.round((successes / size) * 100)}%`,
      median_lat_ms: latencies.length ? median(latencies) : 'N/A',
    });

    // Pause between batch tests to avoid cascading throttle
    await sleep(1000);
  }

  console.log(fmt(rows));
  return rows;
}

// ─── Phase 3: Circuit breaker recovery test ───────────────────────────────────

async function testCircuitBreakerRecovery() {
  console.log('\n=== Phase 3: Circuit breaker recovery test ===');
  console.log('Fires a burst of 8 simultaneous requests to trigger throttling,');
  console.log('then pings once per second until a 200 comes back.\n');

  // Burst — intentionally aggressive to trigger a 403
  const burstIDs = TEST_IDS.slice(0, 8);
  console.log(`Firing burst of ${burstIDs.length} simultaneous requests...`);
  const burstResults = await Promise.all(burstIDs.map(id => probe(id)));
  const burst403s = burstResults.filter(r => r.status === 403).length;
  console.log(`Burst result: ${burst403s} × 403, ${burstResults.filter(r => r.ok).length} × 200`);

  if (burst403s === 0) {
    console.log('No 403 triggered — API may allow this concurrency. Try a larger burst manually.');
    return null;
  }

  // Poll until recovery
  console.log('\nPolling for recovery (1s intervals)...');
  const recoveryID = TEST_IDS[0];
  let recoveryMs = null;
  const start = Date.now();

  for (let attempt = 1; attempt <= 15; attempt++) {
    await sleep(1000);
    const result = await probe(recoveryID);
    const elapsed = Date.now() - start;
    console.log(`  t+${elapsed}ms: status=${result.status}, latency=${result.latency}ms`);

    if (result.ok) {
      recoveryMs = elapsed;
      console.log(`\nRecovery confirmed at t+${recoveryMs}ms after burst.`);
      break;
    }
  }

  if (!recoveryMs) {
    console.log('Still throttled after 15s — circuit breaker OPEN timeout should be > 15s.');
  }

  return recoveryMs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('MET API Throttle Limits — Empirical Test');
  console.log('==========================================');
  console.log('CAUTION: Keep total requests minimal. Run once, not repeatedly.\n');

  const seqResults   = await testSequentialIntervals();
  const concResults  = await testConcurrentBatchSizes();
  const recoveryMs   = await testCircuitBreakerRecovery();

  console.log('\n=== Summary & Recommended Constants ===\n');

  const safeGapRow   = seqResults.find(r => r.success_rate === '100%');
  const safeConcRow  = concResults.slice().reverse().find(r => r.success_rate === '100%');

  if (safeGapRow) {
    console.log(`MIN_REQUEST_GAP_MS:      ${safeGapRow.gap_ms}ms  (lowest gap with 100% success)`);
  } else {
    console.log('MIN_REQUEST_GAP_MS:      unable to determine — all gap sizes had failures');
  }

  if (safeConcRow) {
    console.log(`MAX_CONCURRENT_REQUESTS: ${safeConcRow.batch_size}         (largest batch with 100% success)`);
  } else {
    console.log('MAX_CONCURRENT_REQUESTS: unable to determine — all batch sizes had failures');
  }

  if (recoveryMs != null) {
    const recommended = Math.ceil(recoveryMs / 1000) * 1000 + 1000; // round up + 1s buffer
    console.log(`Circuit breaker OPEN ms: ${recoveryMs}ms measured → recommend ${recommended}ms`);
  }

  console.log('\nUpdate src/utils/constants.js with verified values before shipping Phase 6.');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
