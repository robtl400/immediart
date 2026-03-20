/**
 * Met Museum Collection API Service
 */

import {
  API_BASE_URL,
  MAX_CONCURRENT_REQUESTS,
  BATCH_COOLDOWN_MS,
  MAX_RETRIES,
  RATE_LIMIT_DELAYS,
  MIN_REQUEST_GAP_MS
} from '../utils/constants';
import {
  getCachedIDs,
  setCachedIDs,
  getCachedArtwork,
  setCachedArtwork
} from './artworkCache';

// Utilities
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const addJitter = (ms) => ms + Math.floor(Math.random() * ms * 0.3);

// Delay that cancels immediately if the AbortSignal fires
function delayOrAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}

// Global rate limiter - ensures minimum gap between ALL requests across all contexts
let lastRequestTime = 0;
let requestQueue = Promise.resolve();

async function throttledFetch(url, signal) {
  // Queue this request to ensure sequential execution of throttle logic
  const myRequest = requestQueue.then(async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_GAP_MS) {
      await delay(MIN_REQUEST_GAP_MS - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();
    return fetch(url, { signal });
  });
  requestQueue = myRequest.catch(() => {}); // Don't let errors break the chain
  return myRequest;
}

// Fetch with retry and rate limit handling
async function fetchWithRetry(url, signal = null) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const response = await throttledFetch(url, signal);
      if (response.status === 403 && i < MAX_RETRIES - 1) {
        await delayOrAbort(addJitter(RATE_LIMIT_DELAYS[i] || RATE_LIMIT_DELAYS.at(-1)), signal);
        continue;
      }
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (i === MAX_RETRIES - 1) throw error;
      // Network errors (including CORS-blocked 403s) use rate limit delays
      await delayOrAbort(addJitter(RATE_LIMIT_DELAYS[i] || RATE_LIMIT_DELAYS.at(-1)), signal);
    }
  }
}

// Array shuffle
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Search API - unified search function with rate limit handling
export async function search(query, { artistMode = false, signal = null } = {}) {
  const params = artistMode ? 'hasImages=true&artistOrCulture=true' : 'hasImages=true';
  const url = `${API_BASE_URL}/search?${params}&q=${encodeURIComponent(query)}`;

  // Single attempt - rely on batch-level rate limit handling
  // Retries at this level cause cascading failures
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  try {
    const response = await fetchWithRetry(url, signal);

    if (response.ok) {
      const data = await response.json();
      return data.objectIDs || [];
    }

    // 403 at search level is a hard failure - don't retry
    throw new Error(`Search failed: ${response.status}`);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw error;
  }
}

// Convenience wrappers — cache result in IndexedDB with named keys
export async function fetchAllObjectIDs(signal) {
  const cached = await getCachedIDs('ids:feed:paintings');
  if (cached) return cached;
  const ids = await search('paintings', { signal });
  await setCachedIDs('ids:feed:paintings', ids);
  return ids;
}

export async function searchByArtist(name, signal) {
  const key = `ids:artist:${name}`;
  const cached = await getCachedIDs(key);
  if (cached) return cached;
  const ids = await search(name, { artistMode: true, signal });
  await setCachedIDs(key, ids);
  return ids;
}

export async function searchByTag(term, signal) {
  const key = `ids:tag:${term}`;
  const cached = await getCachedIDs(key);
  if (cached) return cached;
  const ids = await search(term, { signal });
  await setCachedIDs(key, ids);
  return ids;
}

// Artwork validation
export function validateArtwork(artwork) {
  return Boolean(
    artwork?.primaryImage?.trim() &&
    artwork?.title?.trim() &&
    artwork?.artistDisplayName?.trim() &&
    artwork?.isPublicDomain
  );
}

// In-flight dedup: if the same objectID is already being fetched, return the same Promise
const pendingFetches = new Map(); // objectID → Promise

// Fetch single artwork (with cache + in-flight dedup)
export async function fetchArtworkByID(objectID, signal = null) {
  // 1. Cache check
  const cached = await getCachedArtwork(objectID);
  if (cached) return cached;

  // 2. In-flight dedup: return existing Promise if this ID is already being fetched
  if (pendingFetches.has(objectID)) {
    return pendingFetches.get(objectID);
  }

  // 3. Start new fetch
  const promise = (async () => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/objects/${objectID}`, signal);
      if (!response.ok) return null;
      const artwork = await response.json();
      const result = validateArtwork(artwork) ? artwork : null;
      if (result) await setCachedArtwork(objectID, result);
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      return null;
    } finally {
      pendingFetches.delete(objectID);
    }
  })();

  pendingFetches.set(objectID, promise);
  // Clear entry if signal aborts — allows the next caller to start a fresh fetch
  signal?.addEventListener('abort', () => pendingFetches.delete(objectID), { once: true });
  return promise;
}

// Batch fetch with parallel requests
export async function batchFetchArtworks(objectIDs, targetCount = 4, signal = null) {
  const artworks = [];
  let idIndex = 0;

  while (artworks.length < targetCount && idIndex < objectIDs.length) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Batch size: 2x what we need, capped at max concurrent
    const remaining = targetCount - artworks.length;
    const batchSize = Math.min(
      MAX_CONCURRENT_REQUESTS,
      Math.max(remaining * 2, 4),
      objectIDs.length - idIndex
    );

    const batchIDs = objectIDs.slice(idIndex, idIndex + batchSize);
    idIndex += batchSize;

    // Parallel fetch - properly propagate AbortError
    const results = await Promise.all(
      batchIDs.map(id => fetchArtworkByID(id, signal).catch(err => {
        if (err.name === 'AbortError') throw err;
        return null;
      }))
    );
    // If we get here after abort, check signal again
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Add valid artworks (null = failed validation or fetch error)
    const valid = results.filter(Boolean);
    artworks.push(...valid);

    // Cooldown between batches — abort-aware
    if (artworks.length < targetCount && idIndex < objectIDs.length) {
      await delayOrAbort(BATCH_COOLDOWN_MS, signal);
    }
  }

  return artworks.slice(0, targetCount);
}

export { API_BASE_URL };
