/**
 * api-probe.mjs — Met Collection API measurement harness
 *
 * DEV TOOL ONLY — not shipped in production. Supersedes testAPILimits.js.
 *
 * Philosophy: the app's loading constants should trace to measured numbers,
 * not folklore. This probe measures the full pipeline the user actually
 * waits on — search endpoint, object endpoint, and the image CDN — plus the
 * behaviors that drive architecture decisions:
 *
 *   appPath      Simulated cold-start waterfall (search → first objects →
 *                first images), i.e. time-to-first-card as the app is built
 *                today. The one number that matters most.
 *   recovery     Runs FIRST if selected: polls one object every 2s until the
 *                API answers 200 again. Measures the throttle penalty
 *                duration (run right after a run that tripped the throttle).
 *   burst12      Isolated wave of 12 simultaneous requests from a calm state.
 *                Distinguishes "in-flight concurrency cap" from "rate window"
 *                as the throttle trigger. If it trips, measures recovery too.
 *   penalty      Deliberately trips the throttle, then times how long the
 *                penalty lasts (5s polling). Burns a real ban — run sparingly.
 *   window       Measures the ban window's WIDTH: sustains 2 req/s until the
 *                first 403 (max 240 requests / 2 min). A 30s-wide window never
 *                trips at this rate (60 < ~100 budget); a trip at ~N seconds
 *                implies the window is roughly that wide. May burn a ban.
 *   baseline     Sequential /objects/{id} latency distribution + response
 *                headers (cache/CDN fingerprint).
 *   search       Latency + payload size of the app's real search queries.
 *   concurrency  Sweep 4→24 parallel object fetches. Reports throughput,
 *                latency, error rate, and the FIRST-vs-LAST completion
 *                spread inside a wave — the progressive-render headroom.
 *                Stops escalating the moment errors appear.
 *   sustained    40 requests at a steady 10 req/s — does a feed-like
 *                sustained rate degrade or throttle?
 *   images       web-large full-download size/latency, original size via
 *                Range request, CDN cache behavior on repeat.
 *   cacheRepeat  Same object ID 5× — API/CDN cache warm-up fingerprint.
 *
 * Politeness: a full default run issues ~280 JSON + ~16 image requests, paced
 * with cooldowns. The concurrency sweep's instantaneous rate can approach the
 * Met's 80 req/s guidance at the top levels — that is the point of the sweep;
 * the guards below cut it off at the first throttle signal (403/429 or an
 * unparseable 200-status block page), checked between every sub-step.
 * Run when needed, not in a loop.
 *
 * Usage:
 *   node scripts/api-probe.mjs                        # default phases (excludes recovery, burst12, penalty)
 *   node scripts/api-probe.mjs --phases=appPath,images
 *   node scripts/api-probe.mjs --seed=12345           # reproduce a prior run's ID sampling
 *   node scripts/api-probe.mjs --out=/tmp/probe.json  # default: scripts/api-probe-results.json (gitignored)
 */

import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';

const ARGS = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);

const ALL_PHASES = ['appPath', 'baseline', 'search', 'concurrency', 'sustained', 'images', 'cacheRepeat'];
// recovery, burst12, and penalty are opt-in (--phases=recovery,penalty,...):
// recovery only means anything right after a throttled run, and burst12/penalty
// deliberately spend or re-trip the throttle.
const PHASES = typeof ARGS.phases === 'string' ? ARGS.phases.split(',') : ALL_PHASES;
// fileURLToPath, NOT url.pathname: pathname percent-encodes spaces in the repo
// path and the end-of-run write would ENOENT away the whole run's data.
const OUT_PATH = typeof ARGS.out === 'string' ? ARGS.out : fileURLToPath(new URL('./api-probe-results.json', import.meta.url));

// Response headers worth fingerprinting (CDN, cache, throttle hints)
const HEADER_WHITELIST = [
  'server', 'via', 'x-cache', 'age', 'cache-control', 'content-type',
  'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified',
  'x-amz-cf-pop', 'x-amz-cf-id', 'cf-ray', 'x-served-by', 'retry-after',
  'x-ratelimit-limit', 'x-ratelimit-remaining', 'access-control-allow-origin',
];

// ─── small utilities ──────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Seeded PRNG so a run's ID sampling is reproducible from the logged seed
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function stats(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mean = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
  return { n: s.length, min: s[0], p50: pct(s, 50), p90: pct(s, 90), p99: pct(s, 99), max: s.at(-1), mean };
}

function pickHeaders(res) {
  const out = {};
  for (const h of HEADER_WHITELIST) {
    const v = res.headers.get(h);
    if (v != null) out[h] = v;
  }
  return out;
}

function table(rows) {
  if (!rows.length) return '(no rows)';
  const cols = Object.keys(rows[0]);
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = widths.map(w => '─'.repeat(w)).join('─┼─');
  const header = cols.map((c, i) => c.padEnd(widths[i])).join(' │ ');
  const body = rows.map(r => cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' │ '));
  return [header, line, ...body].join('\n');
}

// ─── instrumented fetch ───────────────────────────────────────────────────────

let requestCount = 0;
let throttleHits = 0; // 403/429 responses seen across the whole run

// Timed GET: resolves with header-time, body-time, size, status, headers.
// readBody=false aborts after headers (used to probe originals without
// downloading tens of MB).
async function timedFetch(url, { readBody = true, headers = {} } = {}) {
  requestCount++;
  const controller = new AbortController();
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const tHeaders = performance.now() - t0;
    let bytes = null;
    let tTotal = tHeaders;
    if (readBody) {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
      tTotal = performance.now() - t0;
    } else {
      controller.abort(); // headers are enough; don't pull the body
    }
    if (res.status === 403 || res.status === 429) throttleHits++;
    return {
      ok: res.ok, status: res.status,
      headerMs: Math.round(tHeaders), totalMs: Math.round(tTotal),
      bytes, headers: pickHeaders(res),
    };
  } catch (err) {
    // Our own post-header abort (readBody=false) can't land here — fetch has
    // already resolved by then. Any abort/error caught IS a real failure;
    // report it honestly rather than fabricating a 200.
    return { ok: false, status: 0, headerMs: null, totalMs: Math.round(performance.now() - t0), bytes: null, headers: {}, error: err.message, aborted: err.name === 'AbortError' };
  }
}

// Instrumented GET for phases that need the JSON body. Counts requestCount and
// throttleHits exactly like timedFetch — raw fetch() calls that skip this
// accounting blind the escalation guards. An unparseable 200 body also counts
// as a throttle signal: Imperva can serve 200-status HTML block pages.
async function fetchJson(url) {
  requestCount++;
  const t0 = performance.now();
  try {
    const res = await fetch(url);
    const text = await res.text(); // always consume — frees the socket
    const totalMs = Math.round(performance.now() - t0);
    if (res.status === 403 || res.status === 429) throttleHits++;
    if (!res.ok) return { status: res.status, json: null, bytes: text.length, totalMs };
    try {
      return { status: res.status, json: JSON.parse(text), bytes: text.length, totalMs };
    } catch {
      throttleHits++; // 200-status block page
      return { status: res.status, json: null, bytes: text.length, totalMs, blockPage: true };
    }
  } catch (err) {
    return { status: 0, json: null, bytes: null, totalMs: Math.round(performance.now() - t0), error: err.message };
  }
}

const objectUrl = id => `${BASE_URL}/objects/${id}`;

async function fetchObject(id) {
  const r = await timedFetch(objectUrl(id));
  return { id, ...r };
}

// Worker-pool: run tasks with at most `limit` in flight, no artificial gaps.
async function withConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── ID pool ──────────────────────────────────────────────────────────────────

// One search seeds every phase; IDs are partitioned so no phase re-hits an ID
// another phase warmed in the CDN cache (except cacheRepeat, by design).
async function buildIdPool(rand) {
  const url = `${BASE_URL}/search?hasImages=true&medium=Paintings&q=painting`;
  const r = await fetchJson(url);
  if (!r.json) throw new Error(`Seed search failed: ${r.status}${r.blockPage ? ' (block page)' : ''}`);
  const ids = shuffled(r.json.objectIDs || [], rand);
  if (ids.length < 300) throw new Error(`Seed search returned only ${ids.length} IDs`);
  console.log(`ID pool: ${r.json.total} paintings, all shuffled (seed search: ${r.totalMs}ms, ${Math.round(r.bytes / 1024)}KB)`);
  let cursor = 0;
  return {
    seedSearch: { status: r.status, totalMs: r.totalMs, bytes: r.bytes },
    take(n) {
      const slice = ids.slice(cursor, cursor + n);
      cursor += n;
      if (slice.length < n) console.warn(`pool.take(${n}): only ${slice.length} IDs left — results past this point are short`);
      return slice;
    },
  };
}

// ─── Phase: appPath ───────────────────────────────────────────────────────────
//
// Recreates the app's cold-start waterfall with today's architecture:
//   1. search (medium=Paintings)            — blocking
//   2. FEED_INITIAL_BATCH_SIZE(2) objects   — concurrent, 50ms dispatch gap
//   3. their primaryImageSmall images       — full download (what <img> pulls)
// Reports each stage and the cumulative time-to-first-card / time-to-batch.

async function phaseAppPath(pool) {
  console.log('\n═══ Phase: appPath — cold-start waterfall (current architecture) ═══');
  const t0 = performance.now();

  // Stage 1: search (fresh query string to dodge any CDN cache of the seed search)
  const search = await timedFetch(`${BASE_URL}/search?hasImages=true&medium=Paintings&q=paintings`);
  const tSearch = performance.now() - t0;

  // Stage 2: mimic the app's initial batch — target 2 cards, overfetch 2x
  // (batchSize 4), dispatches 50ms apart (MIN_REQUEST_GAP_MS), concurrent.
  // fetchJson never rejects, so a failure during the dispatch-gap window can't
  // become an unhandled rejection (raw fetch here once could).
  const ids = pool.take(4);
  const objStart = performance.now();
  const objPromises = [];
  for (let i = 0; i < ids.length; i++) {
    objPromises.push(fetchJson(objectUrl(ids[i])));
    if (i < ids.length - 1) await sleep(50); // the app pays N-1 gaps, not N
  }
  const objResults = await Promise.all(objPromises);
  const tObjects = performance.now() - objStart;

  // Stage 3: download the images the feed would render (primaryImageSmall).
  // TTFC is only real if an image was actually fetched — otherwise null, not
  // a search+objects time masquerading as a first card.
  const imgUrls = objResults.map(o => o.json?.primaryImageSmall).filter(Boolean).slice(0, 2);
  const firstImg = imgUrls[0] ? await timedFetch(imgUrls[0]) : null;
  const tFirstCard = firstImg ? Math.round(performance.now() - t0) : null;
  const secondImg = imgUrls[1] ? await timedFetch(imgUrls[1]) : null;
  const tBothCards = secondImg ? Math.round(performance.now() - t0) : null;

  const result = {
    searchMs: Math.round(tSearch),
    objectsBatchMs: Math.round(tObjects),
    firstImage: firstImg && { ms: firstImg.totalMs, kb: firstImg.bytes && Math.round(firstImg.bytes / 1024) },
    secondImage: secondImg && { ms: secondImg.totalMs, kb: secondImg.bytes && Math.round(secondImg.bytes / 1024) },
    timeToFirstCardMs: tFirstCard,
    timeToBothCardsMs: tBothCards,
    searchDetail: search,
  };

  console.log(table([{
    stage_search_ms: result.searchMs,
    stage_objects_ms: result.objectsBatchMs,
    stage_img1_ms: result.firstImage?.ms ?? 'n/a',
    img1_kb: result.firstImage?.kb ?? 'n/a',
    TTFC_ms: result.timeToFirstCardMs ?? 'n/a (no image)',
    both_cards_ms: result.timeToBothCardsMs ?? 'n/a',
  }]));
  return result;
}

// ─── Phase: baseline ──────────────────────────────────────────────────────────

async function phaseBaseline(pool) {
  console.log('\n═══ Phase: baseline — 20 sequential object fetches, 250ms apart ═══');
  const ids = pool.take(20);
  const results = [];
  for (const id of ids) {
    results.push(await fetchObject(id));
    await sleep(250);
  }
  const okResults = results.filter(r => r.status === 200);
  const headerStats = stats(okResults.map(r => r.headerMs));
  const totalStats = stats(okResults.map(r => r.totalMs));
  const sizeStats = stats(okResults.map(r => r.bytes));
  console.log('time-to-headers (ms): ' + JSON.stringify(headerStats));
  console.log('total (ms):           ' + JSON.stringify(totalStats));
  // sizeStats is null when zero 200s came back (all 404 / throttled) — the
  // status histogram below is exactly what we want to see in that case.
  if (sizeStats) {
    console.log(`payload: p50 ${Math.round(sizeStats.p50 / 1024)}KB, max ${Math.round(sizeStats.max / 1024)}KB`);
  } else {
    console.log('payload: n/a — no 200 responses in this phase');
  }
  console.log('header fingerprint (first response): ' + JSON.stringify(results[0]?.headers));
  const statuses = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log('statuses: ' + JSON.stringify(statuses));
  return { headerStats, totalStats, sizeStats, statuses, sampleHeaders: results.slice(0, 3).map(r => r.headers), raw: results };
}

// ─── Phase: search ────────────────────────────────────────────────────────────

async function phaseSearch() {
  console.log('\n═══ Phase: search — the app\'s real query shapes ═══');
  const queries = [
    ['feed (medium=Paintings)', `${BASE_URL}/search?hasImages=true&medium=Paintings&q=portrait`],
    ['artist (artistOrCulture)', `${BASE_URL}/search?hasImages=true&artistOrCulture=true&q=Claude%20Monet`],
    ['tag/free-text', `${BASE_URL}/search?hasImages=true&q=landscape`],
    ['narrow free-text', `${BASE_URL}/search?hasImages=true&q=astrolabe`],
  ];
  const rows = [];
  const raw = [];
  for (const [label, url] of queries) {
    const r = await fetchJson(url); // one instrumented fetch: timing + body
    raw.push({ label, url, status: r.status, totalMs: r.totalMs, bytes: r.bytes, resultCount: r.json?.total ?? null });
    rows.push({ query: label, status: r.status, ms: r.totalMs, kb: r.bytes && Math.round(r.bytes / 1024), results: r.json?.total ?? 'n/a' });
    await sleep(400);
  }
  console.log(table(rows));
  return raw;
}

// ─── Phase: concurrency ───────────────────────────────────────────────────────
//
// For each level c: fire ONE simultaneous wave of exactly c requests (measures
// intra-batch completion spread = progressive-render headroom), then a pooled
// run of 24 requests at concurrency c (measures throughput). Stops escalating
// if a level produces throttle errors.

async function phaseConcurrency(pool) {
  console.log('\n═══ Phase: concurrency — sweep with escalation guard ═══');
  const levels = [4, 8, 12, 16, 24];
  const out = [];
  // Phase-local baseline: a 403 from an EARLIER phase must not be read as a
  // trip at this phase's current level (and vice versa).
  const phaseBase403s = throttleHits;
  for (const c of levels) {
    // Wave: c simultaneous requests; per-request completion offsets
    const waveIds = pool.take(c);
    const waveStart = performance.now();
    const wave = await Promise.all(waveIds.map(async id => {
      const r = await fetchObject(id);
      return { ...r, doneAt: Math.round(performance.now() - waveStart) };
    }));
    const doneTimes = wave.filter(r => r.status === 200).map(r => r.doneAt).sort((a, b) => a - b);
    const spread = doneTimes.length >= 2 ? doneTimes.at(-1) - doneTimes[0] : 'n/a';

    // Guard BETWEEN wave and pooled run — a tripped wave must not be followed
    // by 24 more doomed requests into an active penalty.
    if (throttleHits > phaseBase403s) {
      const row = { concurrency: c, wave_first_done_ms: doneTimes[0] ?? 'n/a', wave_last_done_ms: doneTimes.at(-1) ?? 'n/a', wave_spread_ms: spread, pooled_24_wall_ms: 'skipped', req_per_s: 'n/a', p50_ms: 'n/a', p90_ms: 'n/a', errors: wave.filter(r => r.status !== 200 && r.status !== 404).length };
      out.push({ ...row, waveRaw: wave, pooledStatuses: null });
      console.log(table([row]));
      console.log(`⚠ throttle signal in the ${c}-wide wave — stopping escalation before the pooled run`);
      break;
    }

    await sleep(1500);

    // Pooled throughput: 24 requests, ≤ c in flight
    const poolIds = pool.take(24);
    const poolStart = performance.now();
    const pooled = await withConcurrency(poolIds, c, id => fetchObject(id));
    const wallMs = Math.round(performance.now() - poolStart);
    const okCount = pooled.filter(r => r.status === 200).length;
    const errCount = pooled.filter(r => r.status !== 200 && r.status !== 404).length;
    const latency = stats(pooled.filter(r => r.status === 200).map(r => r.totalMs));

    const row = {
      concurrency: c,
      wave_first_done_ms: doneTimes[0] ?? 'n/a',
      wave_last_done_ms: doneTimes.at(-1) ?? 'n/a',
      wave_spread_ms: spread,
      pooled_24_wall_ms: wallMs,
      req_per_s: (24000 / wallMs).toFixed(1),
      p50_ms: latency?.p50, p90_ms: latency?.p90,
      errors: errCount,
    };
    out.push({ ...row, waveRaw: wave, pooledStatuses: pooled.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {}) });
    console.log(table([row]));

    if (errCount > 2 || throttleHits > phaseBase403s) {
      console.log(`⚠ throttle signal at concurrency ${c} (errors=${errCount}, phase throttle hits=${throttleHits - phaseBase403s}) — stopping escalation`);
      break;
    }
    if (okCount < 20) console.log(`note: only ${okCount}/24 returned 200 (rest likely 404s)`);
    await sleep(2000);
  }
  return out;
}

// ─── Phase: sustained ─────────────────────────────────────────────────────────

async function phaseSustained(pool) {
  console.log('\n═══ Phase: sustained — 40 requests at 10 req/s ═══');
  const ids = pool.take(40);
  const results = new Array(ids.length); // dispatch order, NOT completion order
  const inFlight = [];
  const phaseBase403s = throttleHits;
  for (let i = 0; i < ids.length; i++) {
    const slot = i;
    inFlight.push(fetchObject(ids[i]).then(r => { results[slot] = r; }));
    await sleep(100);
    if (throttleHits > phaseBase403s) { console.log('⚠ throttle hit — stopping sustained phase'); break; }
  }
  await Promise.all(inFlight);
  // Drift halves must be split by DISPATCH order — completion order would
  // migrate slow early requests into the "second half" and manufacture drift.
  const settled = results.filter(Boolean);
  const ok = settled.filter(r => r.status === 200);
  const firstHalf = stats(ok.slice(0, Math.floor(ok.length / 2)).map(r => r.totalMs));
  const secondHalf = stats(ok.slice(Math.floor(ok.length / 2)).map(r => r.totalMs));
  const statuses = settled.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log(`statuses: ${JSON.stringify(statuses)}`);
  if (firstHalf && secondHalf) {
    console.log(`latency drift: first-half p50 ${firstHalf.p50}ms → second-half p50 ${secondHalf.p50}ms`);
  } else {
    console.log('latency drift: n/a — too few successful responses');
  }
  return { statuses, firstHalf, secondHalf, raw: settled };
}

// ─── Phase: images ────────────────────────────────────────────────────────────

async function phaseImages(pool) {
  console.log('\n═══ Phase: images — CDN size/latency for web-large + original ═══');
  // Need artworks WITH images: fetch objects until 6 have primaryImageSmall
  const candidates = pool.take(14);
  const arts = [];
  for (const id of candidates) {
    if (arts.length >= 6) break;
    const r = await fetchJson(objectUrl(id));
    if (r.json?.primaryImageSmall && r.json?.primaryImage) arts.push(r.json);
    await sleep(150);
  }

  const rows = [];
  const raw = [];
  for (const [i, a] of arts.entries()) {
    // web-large: full download (what the feed <img> actually pulls)
    const wl = await timedFetch(a.primaryImageSmall);
    // original: Range probe — size without the download
    const orig = await timedFetch(a.primaryImage, { readBody: false, headers: { Range: 'bytes=0-0' } });
    const origSize = orig.headers['content-range']?.split('/')[1] ?? orig.headers['content-length'] ?? null;
    // repeat web-large on the FIRST artwork only — CDN warm-cache check
    let repeat = null;
    if (i === 0) { await sleep(300); repeat = await timedFetch(a.primaryImageSmall); }

    raw.push({ id: a.objectID, webLarge: wl, original: orig, originalBytes: origSize && Number(origSize), repeat });
    rows.push({
      id: a.objectID,
      weblarge_kb: wl.bytes && Math.round(wl.bytes / 1024),
      weblarge_ms: wl.totalMs,
      original_mb: origSize ? (Number(origSize) / 1048576).toFixed(1) : 'n/a',
      range_honored: orig.headers['content-range'] ? 'yes' : 'no',
      repeat_ms: repeat?.totalMs ?? '',
      x_cache: (raw.at(-1).webLarge.headers['x-cache'] || '').slice(0, 20),
    });
    await sleep(400);
  }
  console.log(table(rows));
  console.log('image header fingerprint: ' + JSON.stringify(raw[0]?.webLarge.headers));
  return raw;
}

// ─── Phase: recovery ──────────────────────────────────────────────────────────
//
// Polls a single known-good object every 2s until the API answers 200 again.
// Only meaningful when the API is currently throttling this IP (run it right
// after a run that tripped the throttle, or after burst12 trips it).

const RECOVERY_PROBE_ID = 436535; // stable public-domain painting

// Default 5s polling everywhere: a sliding-window ban could be extended by
// aggressive polling, which would corrupt the very number this measures.
async function measureRecovery(label = 'recovery', intervalMs = 5000) {
  console.log(`\n═══ Phase: ${label} — polling every ${intervalMs / 1000}s until the throttle lifts ═══`);
  const start = performance.now();
  const attempts = [];
  const maxAttempts = Math.ceil(300000 / intervalMs); // give up after ~5 min
  for (let i = 0; i < maxAttempts; i++) {
    const r = await timedFetch(objectUrl(RECOVERY_PROBE_ID));
    const elapsed = Math.round(performance.now() - start);
    attempts.push({ elapsed, status: r.status });
    if (r.status === 200) {
      console.log(`throttle lifted after ${(elapsed / 1000).toFixed(1)}s (${i + 1} probes)`);
      return { recoveredAfterMs: elapsed, attempts };
    }
    if (i % 5 === 0) console.log(`  t+${(elapsed / 1000).toFixed(0)}s: still ${r.status}`);
    await sleep(intervalMs);
  }
  console.log('still throttled after 5 minutes of polling');
  return { recoveredAfterMs: null, attempts };
}

async function phaseRecovery() {
  const first = await timedFetch(objectUrl(RECOVERY_PROBE_ID));
  if (first.status === 200) {
    console.log('\n═══ Phase: recovery — API already answering 200; nothing to measure ═══');
    return { alreadyRecovered: true };
  }
  return measureRecovery();
}

// ─── Phase: burst12 ───────────────────────────────────────────────────────────
//
// From a calm state (8s idle first), fire exactly 12 simultaneous requests
// with NOTHING before them. If they 403, the trigger is the in-flight
// concurrency cap itself; if they succeed, the earlier trip was a rate window
// filled by preceding traffic. Measures recovery if it trips.

async function phaseBurst12(pool) {
  console.log('\n═══ Phase: burst12 — isolated 12-wide wave from a calm state ═══');
  if (requestCount > 40) {
    console.log(`note: ${requestCount} requests already sent this run — 8s of idle does not empty a ~60s rolling window; run burst12 standalone for a true calm-state answer`);
  }
  console.log('idling 8s to ensure a calm window...');
  await sleep(8000);
  const ids = pool.take(12);
  const waveStart = performance.now();
  const wave = await Promise.all(ids.map(async id => {
    const r = await fetchObject(id);
    return { ...r, doneAt: Math.round(performance.now() - waveStart) };
  }));
  const statuses = wave.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log('wave statuses: ' + JSON.stringify(statuses));
  console.log(table(wave.map(r => ({ id: r.id, status: r.status, done_ms: r.doneAt }))));

  let recovery = null;
  if (wave.some(r => r.status === 403 || r.status === 429)) {
    console.log('burst tripped the throttle → measuring recovery');
    recovery = await measureRecovery('burst12-recovery');
  }
  return { statuses, wave, recovery };
}

// ─── Phase: penalty ───────────────────────────────────────────────────────────
//
// Measures the throttle's two defining numbers in one controlled trip:
//   1. Bucket depth — streams requests at concurrency 16 and stops at the
//      FIRST throttled response; the count sent before it approximates how
//      many requests a calm client gets before the window closes.
//   2. Penalty duration — then polls every 5s until a 200 returns. 5s (not
//      2s) because a sliding-window ban could be extended by aggressive
//      polling, which would corrupt the number this phase exists to measure.
// Hard cap 150 requests; if that doesn't trip, report and give up rather
// than escalate. Burns a real ban — run sparingly.

async function phasePenalty(pool) {
  console.log('\n═══ Phase: penalty — stream until first 403, then recovery timing ═══');
  const ids = pool.take(150);
  let tripped = false;
  let sent = 0;
  const results = [];
  const start = performance.now();
  async function worker() {
    while (!tripped && sent < ids.length) {
      const ord = sent; // dispatch ordinal — bucket depth must count SENT
      const id = ids[sent++];
      const r = await fetchObject(id);
      results.push({ ...r, ord, at: Math.round(performance.now() - start) });
      if (r.status === 403 || r.status === 429) tripped = true;
    }
  }
  await Promise.all(Array.from({ length: 16 }, worker));

  const wallMs = Math.round(performance.now() - start);
  const statuses = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log(`streamed ${results.length} requests in ${wallMs}ms (${(results.length * 1000 / wallMs).toFixed(1)} req/s): ${JSON.stringify(statuses)}`);

  if (!tripped) {
    console.log('150 requests did not trip the throttle — bucket deeper than this probe is willing to go');
    return { tripped: false, statuses, wallMs };
  }
  // Bucket depth by dispatch ordinal, not completion time: fast ~90ms 403s
  // complete before earlier-sent slow 200s, so counting "completed before the
  // 403" undercounts by up to concurrency-1.
  const throttled = results.filter(r => r.status === 403 || r.status === 429);
  const firstThrottleOrd = Math.min(...throttled.map(r => r.ord));
  const firstThrottleAt = throttled.find(r => r.ord === firstThrottleOrd).at;
  console.log(`first throttled request was dispatch #${firstThrottleOrd + 1} (t+${firstThrottleAt}ms) → bucket depth ≈ ${firstThrottleOrd} requests dispatched before it`);
  const recovery = await measureRecovery('penalty-recovery', 5000);
  return { tripped: true, statuses, wallMs, bucketDepth: firstThrottleOrd, firstThrottleAtMs: firstThrottleAt, recovery, raw: results };
}

// ─── Phase: window ────────────────────────────────────────────────────────────
//
// The rolling-window budget (~100 requests) is measured, but the WINDOW WIDTH
// is not — and the app's client budget (60/30s) is only safe if the real
// window is ~30s. Sustain 2 req/s: over 30s that's 60 requests (under budget,
// never trips); over 60s it's 120 (over budget — trips ~50-60s in if the
// window is that wide). Where the first 403 lands bounds the width.

async function phaseWindow(pool) {
  console.log('\n═══ Phase: window — 2 req/s sustained until first 403 (max 240 req) ═══');
  const ids = pool.take(240);
  const start = performance.now();
  const results = [];
  for (const id of ids) {
    const r = await fetchObject(id);
    const at = Math.round(performance.now() - start);
    results.push({ id, status: r.status, at });
    if (r.status === 403 || r.status === 429) {
      const sent = results.length;
      console.log(`first 403 at request #${sent}, t+${(at / 1000).toFixed(1)}s → window is at least ~${Math.round(at / 1000)}s wide (budget spent at 2 req/s)`);
      return { tripped: true, atMs: at, requestsSent: sent, raw: results };
    }
    if (results.length % 40 === 0) console.log(`  ${results.length} sent, t+${(at / 1000).toFixed(0)}s, all clean`);
    await sleep(500);
  }
  const wallMs = Math.round(performance.now() - start);
  console.log(`no trip after ${results.length} requests over ${(wallMs / 1000).toFixed(0)}s — 2 req/s sustained is safe; window ≲30-50s or budget deeper than measured`);
  return { tripped: false, requestsSent: results.length, wallMs, raw: results };
}

// ─── Phase: cacheRepeat ───────────────────────────────────────────────────────

async function phaseCacheRepeat(pool) {
  console.log('\n═══ Phase: cacheRepeat — same object 5×, 500ms apart ═══');
  const [id] = pool.take(1);
  const results = [];
  for (let i = 0; i < 5; i++) {
    if (i > 0) await sleep(500);
    results.push(await fetchObject(id));
  }
  console.log(table(results.map((r, i) => ({
    attempt: i + 1, status: r.status, ms: r.totalMs,
    age: r.headers.age ?? '', x_cache: r.headers['x-cache'] ?? '', cache_control: r.headers['cache-control'] ?? '',
  }))));
  return results;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = typeof ARGS.seed === 'string' ? Number(ARGS.seed) : Date.now() % 2147483647;
  const rand = mulberry32(seed);
  console.log(`Met API probe — phases: ${PHASES.join(', ')} (seed ${seed})`);
  console.log('Budget guard: run stops escalation phases on first throttle signal.\n');

  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const results = { startedAt, seed, phases: PHASES };
  // Persist after every phase, not only at the end — a mid-run crash must not
  // discard measurements the run already paid live requests (or a ban) for.
  const persist = () => writeFile(OUT_PATH, JSON.stringify(results, null, 2))
    .catch(err => console.error(`could not write ${OUT_PATH}: ${err.message}`));

  // recovery runs BEFORE the pool-seeding search wherever it appears in the
  // list — while throttled, the seed search itself would 403 and abort the run.
  const phasesQueue = [...PHASES];
  if (phasesQueue.includes('recovery')) {
    results.recovery = await phaseRecovery();
    phasesQueue.splice(phasesQueue.indexOf('recovery'), 1);
    await persist();
    await sleep(1000);
  }

  // A recovery-only run needs no ID pool (and the seed search would waste a
  // request or crash if the throttle hasn't lifted).
  const pool = phasesQueue.length ? await buildIdPool(rand) : null;
  if (pool) results.seedSearch = pool.seedSearch;

  const runners = {
    appPath: () => phaseAppPath(pool),
    baseline: () => phaseBaseline(pool),
    search: () => phaseSearch(),
    concurrency: () => phaseConcurrency(pool),
    sustained: () => phaseSustained(pool),
    images: () => phaseImages(pool),
    cacheRepeat: () => phaseCacheRepeat(pool),
    recovery: () => phaseRecovery(),
    burst12: () => phaseBurst12(pool),
    penalty: () => phasePenalty(pool),
    window: () => phaseWindow(pool),
  };

  for (const phase of phasesQueue) {
    if (!runners[phase]) { console.warn(`unknown phase: ${phase}`); continue; }
    try {
      results[phase] = await runners[phase]();
    } catch (err) {
      console.error(`phase ${phase} failed: ${err.message}`);
      results[phase] = { error: err.message };
    }
    await persist();
    await sleep(1000);
  }

  results.totalRequests = requestCount;
  results.throttleHits = throttleHits;
  results.wallClockMs = Math.round(performance.now() - t0);

  await writeFile(OUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nDone: ${requestCount} requests, ${throttleHits} throttle hits, ${Math.round(results.wallClockMs / 1000)}s.`);
  console.log(`Full results: ${OUT_PATH}`);
}

main().catch(err => { console.error('Probe failed:', err); process.exit(1); });
