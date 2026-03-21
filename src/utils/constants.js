/**
 * Application Constants
 * Centralized configuration values used throughout the app
 */

// API Configuration
export const API_BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';

// Parallel Fetching Configuration
// Tuned 2026-03-20 via scripts/testAPILimits.js:
//   - 100% success at all gap sizes (10–160ms) and batch sizes (2–8)
//   - No 403s triggered at any tested concurrency level
//   - Constants set conservatively below the observed limits
export const MAX_CONCURRENT_REQUESTS = 6; // was 4 — 8 concurrent tested clean; 6 is the conservative floor
export const BATCH_COOLDOWN_MS = 150;     // was 250 — dynamic concurrency handles bursts; static cooldown is the floor
export const RATE_LIMIT_RECOVERY_MS = 1000; // 1 second after errors (no 403 recovery data — keep default)
export const MIN_REQUEST_GAP_MS = 50;    // was 80 — 10ms tested clean; 50ms is a safe conservative floor

// Batch Sizes
export const FEED_BATCH_SIZE = 4; // Artworks to fetch per load in discovery feed (increased)
export const GRID_BATCH_SIZE = 6; // Thumbnails to fetch per load in grid view (increased)

// Memory Management
export const MAX_ARTWORKS_IN_MEMORY = 30; // Maximum artworks to keep in discovery feed

// Timing
export const SEARCH_COOLDOWN_MS = 300; // Minimum time between searches (allows rate limit recovery)
export const NAVIGATION_DELAY_MS = 150; // Delay before search after navigation
export const MODAL_CLOSE_DELAY_MS = 200; // Delay for modal close animation

// Scroll Detection
export const BANNER_SCROLL_THRESHOLD = 500; // Pixels scrolled before banner collapses
export const FEED_ROOT_MARGIN = '1200px'; // Trigger ~2 artworks before sentinel visible
export const GRID_ROOT_MARGIN = '400px'; // Root margin for grid infinite scroll

// Retry Configuration
export const MAX_RETRIES = 3; // Retry up to 3x on 403/network errors with exponential backoff
export const RATE_LIMIT_DELAYS = [1000, 2000, 4000];
