/**
 * Application Constants
 * Centralized configuration values used throughout the app
 */

// API Configuration
export const API_BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';

// Parallel Fetching Configuration
// Re-measured 2026-07-07 via scripts/api-probe.mjs (see scripts/API-FINDINGS.md):
//   - The throttle is Imperva bot protection: it bans on CUMULATIVE volume
//     (~100 requests per rolling window), not concurrency (12 simultaneous
//     from calm passed clean) or rate (10 req/s sustained passed clean).
//   - The penalty lasts ~56-62s and returns instant HTML 403s.
export const MAX_CONCURRENT_REQUESTS = 6; // concurrency is NOT the throttle trigger; 6 stays comfortable
export const BATCH_COOLDOWN_MS = 80;      // between-batch pause; dynamic concurrency handles real stress
export const RATE_LIMIT_RECOVERY_MS = 1000; // delay before the ONE auto-retry after a transient batch error
export const MIN_REQUEST_GAP_MS = 50;    // dispatch pacing — keeps bursts smooth

// Rolling request budget (requestManager token bucket) — keeps a fast scroller
// below the measured ban threshold. The window probe (2026-07-07) showed the
// Imperva window is AT LEAST ~52s wide: 2 req/s sustained tripped at request
// #80, t+51.5s — so a 30s window was unsafe (it allowed 120/min). 60 per 60s
// caps sustained usage at 1 req/s, the community's known-safe rate, while
// still allowing the full 60 as an instant burst (bursts to ~98 measured
// clean). When spent, dispatches queue until the oldest request ages out
// instead of triggering a ~60s dead feed.
export const REQUEST_BUDGET = 60;
export const REQUEST_BUDGET_WINDOW_MS = 60000;

// Batch Sizes
export const FEED_BATCH_SIZE = 4;         // Artworks to fetch per subsequent load in discovery feed
export const FEED_INITIAL_BATCH_SIZE = 2; // Smaller first batch so first artworks appear sooner
export const GRID_BATCH_SIZE = 9;         // Thumbnails to fetch per load in grid view
export const GRID_INITIAL_BATCH_SIZE = 4; // First batch — 2 rows on 2-col grid; seed artwork covers the first visible row

// Memory Management
export const MAX_ARTWORKS_IN_MEMORY = 30; // Maximum artworks to keep in discovery feed

// Timing
export const SEARCH_COOLDOWN_MS = 300; // Minimum time between searches (allows rate limit recovery)
export const NAVIGATION_DELAY_MS = 150; // Delay before search after navigation
export const MODAL_CLOSE_DELAY_MS = 200; // Delay for modal close animation
export const SHARE_FEEDBACK_MS = 2000; // How long the "Copied!" share confirmation shows

// Scroll Detection
export const BANNER_SCROLL_THRESHOLD = 500; // Pixels scrolled before banner collapses
export const FEED_ROOT_MARGIN = '1200px'; // Trigger ~2 artworks before sentinel visible
export const GRID_ROOT_MARGIN = '1200px'; // Root margin for grid infinite scroll — matches feed

// Retry Configuration — NETWORK errors only. A 403 is never retried: it means
// the Imperva penalty window (~60s measured) is active, so an in-penalty retry
// is a guaranteed 403 that may extend the ban. The circuit breaker owns 403
// recovery (see requestManager.js).
export const MAX_RETRIES = 3;
export const RATE_LIMIT_DELAYS = [1000, 2000, 4000];
