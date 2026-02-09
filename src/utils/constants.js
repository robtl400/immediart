/**
 * Application Constants
 * Centralized configuration values used throughout the app
 */

// API Configuration
export const API_BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';

// Parallel Fetching Configuration
// The Met API rate limits aggressively - prioritize reliability over speed
export const MAX_CONCURRENT_REQUESTS = 2; // Sequential-ish fetching to avoid rate limits
export const BATCH_COOLDOWN_MS = 1000; // 1 second between batches
export const RATE_LIMIT_RECOVERY_MS = 3000; // Wait time after errors

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
// Note: Retries disabled (MAX_RETRIES=1) because CORS-blocked 403s can't be distinguished
// from real network errors, and retrying just doubles request count during rate limiting
export const MAX_RETRIES = 1; // No retries - fail fast to avoid request storms
export const RETRY_DELAYS = [2000]; // Not used when MAX_RETRIES=1
export const RATE_LIMIT_DELAYS = [3000]; // Not used when MAX_RETRIES=1
