# Met API — measured findings & grounded loading plan

_Measured 2026-07-07 with `scripts/api-probe.mjs` (4 runs, ~480 requests total) plus a
research sweep of official docs, community reports, and direct CDN probes. The probe
writes its JSON to `scripts/api-probe-results.json` (gitignored); re-run it to
regenerate. Numbers below are from Node on a residential IP — Imperva trusts real
browsers **more** than Node/curl, so throttle numbers are conservative floors for
real users._

## The throttle — what it actually is

The 403s are **Imperva/Incapsula bot protection**, not a Met API quota. The official
docs say only "please limit request rate to 80 requests per second"; the enforced
behavior is entirely undocumented ([openaccess#60](https://github.com/metmuseum/openaccess/issues/60),
open, assigned to the Met's lead collection developer).

| Measurement | Result |
|---|---|
| Budget before first 403 (from calm) | **≥ 98 requests** (streamed at 85 req/s; 98 counted by completion order with 16 in flight, so the true window is plausibly ~100–113) |
| Accidental trip in run 1 | ~90 requests cumulative over 25s |
| 12 simultaneous from calm | clean |
| 32 requests @ 16 concurrent | clean |
| 24 pooled @ 8 concurrent (33 req/s) | clean |
| 40 sustained @ 10 req/s | clean, zero latency drift |
| **Penalty duration** | **≈ 56–62s** (lifted at the 61.4s poll; 5s polling resolution — community reports "30+s") |
| Throttled response | instant ~90ms 403, HTML Incapsula body, **no Retry-After**, `cache-control: no-cache, no-store` |

Conclusions:
- The trigger is **volume in a rolling window (~100 requests)**, not in-flight
  concurrency and not requests-per-second per se.
- Blocks are per-client (Imperva cookies + IP). Browsers with established
  `incap_ses_*` cookies get the most lenient treatment.
- Community datapoint: 1 req/s ran overnight without a block.
- Imperva can also serve **200-status block pages** ("Incapsula incident ID" HTML) —
  a JSON parse failure on a 200 should be treated like a 403.

## Latency & payloads (measured)

| Thing | Latency | Size |
|---|---|---|
| `/objects/{id}` | p50 121ms, p90 306ms | ~2KB |
| `/search` (feed query, 14.3k IDs) | 276–1146ms | 92KB |
| `/search` (narrow) | ~141ms | <1KB |
| web-large image (feed) | 26–116ms | 64–109KB (~600px class) |
| original image | — | **1.2–8.3MB** (2000–4000px) |
| iiif `main-image` (undocumented) | — | 74–513KB (exactly 1200px long side) |

- `/objects/{id}` sends **no cache headers at all** → the browser HTTP cache does
  nothing for JSON; our IndexedDB cache (24h IDs / 7d objects) is load-bearing. Met
  data refreshes via a **nightly ETL**, so those TTLs are safe (could go longer).
- Image CDN sends `cache-control: public, max-age=16h–5d` + ETag → browser HTTP
  cache works for images.
- **CORS (verified live, resolves conflicting reports):** with an `Origin` header,
  BOTH `images.metmuseum.org` and the `main-image` endpoint return
  `access-control-allow-origin: *`. So `crossorigin="anonymous"` + service-worker
  `CacheFirst` is safe (non-opaque responses — no Chrome 7MB-per-entry quota padding).
- The undocumented size ladder for a `web-large` URL (swap the folder segment):
  `web-additional` ~150px / `mobile-large` ~445px / `web-large` ~600px, plus
  `https://collectionapi.metmuseum.org/api/collection/v1/iiif/{objectID}/main-image`
  at a fixed 1200px. **No resize params, no real IIIF** (`info.json` 404s).
- WAF budgets are split by host: `images.metmuseum.org` is Imperva site 1661977;
  `collectionapi.metmuseum.org` (JSON **and** `main-image`) is site 1662004. Using
  `main-image` for feed images would spend the JSON API's throttle budget.

## Cold-start waterfall today (measured, current architecture)

```
search 734ms  →  first object batch (4 fetches for 2 targets) 331ms  →  first image 247ms
Time-to-first-card ≈ 1.31s   ·   both initial cards ≈ 1.50s
```
Treat these as floors: the probe's connection to the API host was already warm
from the seed search, and a real browser also pays DNS+TCP+TLS per origin
(~100–300ms each) because nothing preconnects.

## Where today's code disagrees with the measured reality

1. **Retry ladder (1s/2s/4s) retries entirely inside the ~61s penalty** — every retry
   is a guaranteed 403 that may extend the block ([constants.js](../src/utils/constants.js) `RATE_LIMIT_DELAYS`).
2. **Circuit breaker opens for only 5s** ([requestManager.js](../src/services/requestManager.js) `CB_OPEN_DURATION_MS`)
   — after a real trip it sends ~12 doomed probes over the next minute instead of one
   when the penalty actually lifts.
3. **No cumulative request budget.** The knobs (6 concurrent, 50ms gap, 80ms cooldown)
   pace bursts fine, but nothing stops a fast scroller from spending ~100 requests in
   a window (8 per feed load-more incl. 2× overfetch; 9–18 per grid load). Concurrency
   is NOT the trigger, so `MAX_CONCURRENT_REQUESTS=6` is not the problem.
4. **Batch-gated rendering.** The feed paints nothing until a whole batch of objects
   resolves. Measured intra-batch completion spread: 157–340ms — the first card could
   consistently paint that much earlier (more at p90+), and the initial batch waits on
   4 fetches to fill 2 slots.
5. **The modal downloads `/original/` (1.2–8.3MB)** even though the ~600px web-large
   is typically already in the browser cache from the feed, and a 1200px tier exists.
6. **No preconnect** to either origin.
7. **Images are never service-worker cached** — now known safe via CORS mode.
8. `hasImages=true` returns imageless objects (confirmed API bug, issues #52/#57) —
   already handled by `validateArtwork` + overfetch; a persistent negative cache of
   known-bad IDs would stop refetching them every session.

## Grounded improvement plan (ranked)

| # | Change | Grounding |
|---|---|---|
| A | **Throttle-correct guardrails**: breaker opens ~60s (measured ≈56–62s) with escalating re-open; treat non-JSON 200s as throttle; kill in-penalty retries; add a client token bucket (~60 req / 30s) | penalty + bucket measurements |
| B | **Progressive per-card render**: skeleton slots from the ID list, each card fills as its object resolves; keep batching only as network pacing | 157–340ms measured spread; standard out-of-order pattern |
| C | **Preconnect** both origins in `index.html`; consider initial batch targeting first paint (2 slots) with less up-front overfetch | ~100–300ms × 2 origins |
| D | **Image tiering**: feed keeps web-large; modal shows cached web-large instantly → upgrades to `main-image` (1200px) → fetches `/original/` only on zoom-in | size ladder measurements |
| E | **SW CacheFirst for images** with `crossorigin="anonymous"` + expiration (maxEntries ~300, purgeOnQuotaError) | CORS verified; 7MB opaque-padding pitfall avoided |
| F | Persistent negative cache for imageless IDs | API bug #52/#57 |

**Deliberately not doing:** Netlify proxy (Imperva blocks datacenter/non-browser
clients hardest — a proxy would 403 more than browsers do); static index from the
openaccess CSV (stale since June 2023, contains no image URLs); srcset pairing
web-large with original (browsers would pull multi-MB originals into the feed).
