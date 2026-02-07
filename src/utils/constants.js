/**
 * Application Constants
 * Centralized configuration values used throughout the app
 */

// API Configuration
export const API_BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';

// Parallel Fetching Configuration (based on empirical API testing)
// The Met API has a rolling window rate limit, not just per-second
// Optimal pattern: 10 parallel requests with 500ms cooldown between batches
export const MAX_CONCURRENT_REQUESTS = 10; // Max parallel requests per batch
export const BATCH_COOLDOWN_MS = 500; // Cooldown between parallel batches
export const RATE_LIMIT_RECOVERY_MS = 1000; // Wait time after 403 before retry

// Batch Sizes
export const FEED_BATCH_SIZE = 4; // Artworks to fetch per load in discovery feed (increased)
export const GRID_BATCH_SIZE = 6; // Thumbnails to fetch per load in grid view (increased)

// Memory Management
export const MAX_ARTWORKS_IN_MEMORY = 30; // Maximum artworks to keep in discovery feed

// Timing
export const SEARCH_COOLDOWN_MS = 800; // Minimum time between searches (allows rate limit recovery)
export const NAVIGATION_DELAY_MS = 500; // Delay before search after navigation
export const MODAL_CLOSE_DELAY_MS = 200; // Delay for modal close animation

// Scroll Detection
export const BANNER_SCROLL_THRESHOLD = 500; // Pixels scrolled before banner collapses
export const FEED_ROOT_MARGIN = '1200px'; // Trigger ~2 artworks before sentinel visible
export const GRID_ROOT_MARGIN = '400px'; // Root margin for grid infinite scroll

// Retry Configuration
export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [500, 1000, 2000]; // Exponential backoff delays
export const RATE_LIMIT_DELAYS = [1000, 1500, 2000]; // Delays for 403 errors (with jitter added)
