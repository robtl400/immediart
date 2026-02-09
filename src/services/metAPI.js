/**
 * Met Museum Collection API Service
 */

import {
  API_BASE_URL,
  MAX_CONCURRENT_REQUESTS,
  BATCH_COOLDOWN_MS,
  RATE_LIMIT_RECOVERY_MS,
  MAX_RETRIES,
  RATE_LIMIT_DELAYS
} from '../utils/constants';

// Utilities
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const addJitter = (ms) => ms + Math.floor(Math.random() * ms * 0.3);

// Fetch with retry and rate limit handling
async function fetchWithRetry(url, signal = null) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const response = await fetch(url, { signal });
      if (response.status === 403 && i < MAX_RETRIES - 1) {
        await delay(addJitter(RATE_LIMIT_DELAYS[i] || RATE_LIMIT_DELAYS.at(-1)));
        continue;
      }
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (i === MAX_RETRIES - 1) throw error;
      // Network errors (including CORS-blocked 403s) use rate limit delays
      await delay(addJitter(RATE_LIMIT_DELAYS[i] || RATE_LIMIT_DELAYS.at(-1)));
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

// Convenience wrappers
export const fetchAllObjectIDs = (signal) => search('paintings', { signal });
export const searchByArtist = (name, signal) => search(name, { artistMode: true, signal });
export const searchByTag = (term, signal) => search(term, { signal });

// Artwork validation
export function validateArtwork(artwork) {
  return Boolean(
    artwork?.primaryImage?.trim() &&
    artwork?.title?.trim() &&
    artwork?.artistDisplayName?.trim() &&
    artwork?.isPublicDomain
  );
}

// Fetch single artwork
export async function fetchArtworkByID(objectID, signal = null) {
  try {
    const response = await fetchWithRetry(`${API_BASE_URL}/objects/${objectID}`, signal);
    if (!response.ok) return null;
    const artwork = await response.json();
    return validateArtwork(artwork) ? artwork : null;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return null;
  }
}

// Batch fetch with parallel requests and rate limit handling
export async function batchFetchArtworks(objectIDs, targetCount = 4, signal = null) {
  const artworks = [];
  let idIndex = 0;
  let rateLimitStreak = 0;

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

    // Parallel fetch
    const results = await Promise.all(
      batchIDs.map(id => fetchArtworkByID(id, signal).catch(() => null))
    );
    const valid = results.filter(Boolean);

    // Handle rate limiting
    if (valid.length === 0 && results.length > 0) {
      rateLimitStreak++;
      if (rateLimitStreak >= 2) await delay(RATE_LIMIT_RECOVERY_MS * rateLimitStreak);
    } else {
      rateLimitStreak = 0;
      artworks.push(...valid);
    }

    // Cooldown between batches
    if (artworks.length < targetCount && idIndex < objectIDs.length) {
      await delay(BATCH_COOLDOWN_MS);
    }
  }

  return artworks.slice(0, targetCount);
}

export { API_BASE_URL };
