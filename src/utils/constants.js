/**
 * Application Constants
 * Centralized configuration values used throughout the app
 */

// API Configuration
export const API_BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';

// Parallel Fetching Configuration
// The Met API has a rolling window rate limit (~80 req/sec) but bursts trigger 403s
// Conservative pattern: fewer parallel requests with longer cooldowns
export const MAX_CONCURRENT_REQUESTS = 5; // Max parallel requests per batch (reduced from 10)
export const BATCH_COOLDOWN_MS = 800; // Cooldown between parallel batches (increased from 500)
export const RATE_LIMIT_RECOVERY_MS = 2000; // Wait time after 403 before retry (increased from 1000)

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
export const MAX_RETRIES = 2; // Reduced from 3 to avoid retry storms
export const RETRY_DELAYS = [1000, 2000]; // Exponential backoff delays
export const RATE_LIMIT_DELAYS = [2000, 4000]; // Longer delays for 403 errors (with jitter added)
