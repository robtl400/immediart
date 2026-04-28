/**
 * Met Museum Collection API Service
 */

import {
  API_BASE_URL,
  MAX_RETRIES,
  RATE_LIMIT_DELAYS,
} from '../utils/constants';
import {
  getCachedIDs,
  setCachedIDs,
  getCachedArtwork,
  setCachedArtwork
} from './artworkCache';
import { addJitter, delayOrAbort } from '../utils/delay';
import { requestManager } from './requestManager';

// Fetch with retry and rate limit handling — delegates throttle to requestManager
async function fetchWithRetry(url, signal = null) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const response = await requestManager.fetch(url, signal);
      if (response.status === 403 && i < MAX_RETRIES - 1) {
        await delayOrAbort(addJitter(RATE_LIMIT_DELAYS[i] || RATE_LIMIT_DELAYS.at(-1)), signal);
        continue;
      }
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (i === MAX_RETRIES - 1) throw error;
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

// Search API
export async function search(query, { artistMode = false, medium = null, signal = null } = {}) {
  const params = new URLSearchParams({ hasImages: 'true', q: query });
  if (artistMode) params.set('artistOrCulture', 'true');
  if (medium) params.set('medium', medium);
  const url = `${API_BASE_URL}/search?${params}`;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  try {
    const response = await fetchWithRetry(url, signal);
    if (response.ok) {
      const data = await response.json();
      return data.objectIDs || [];
    }
    throw new Error(`Search failed: ${response.status}`);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw error;
  }
}

// Convenience wrappers — cache result in IndexedDB with named keys
export async function fetchAllObjectIDs(signal) {
  const cached = await getCachedIDs('ids:feed:paintings-v2');
  if (cached) return cached;
  const ids = await search('painting', { medium: 'Paintings', signal });
  if (ids.length === 0) {
    console.warn('[metAPI] fetchAllObjectIDs returned 0 IDs — skipping cache');
    return ids;
  }
  await setCachedIDs('ids:feed:paintings-v2', ids);
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

// Allowed object types — expanded from 'painting' only based on live API sampling.
const OBJECT_TYPES = [
  'painting',
  'watercolor',
  'fresco',
  'mural',
  'portrait',
  'thangka',
  'kakemono',
];

export function validateArtwork(artwork) {
  const name = artwork?.objectName?.toLowerCase() ?? '';
  return Boolean(
    artwork?.primaryImage?.trim() &&
    artwork?.title?.trim() &&
    OBJECT_TYPES.some(type => name.startsWith(type))
  );
}

// Fetch single artwork (with cache + in-flight dedup via requestManager)
export async function fetchArtworkByID(objectID, signal = null) {
  // 1. Cache check
  const cached = await getCachedArtwork(objectID);
  if (cached) return cached;

  // 2. In-flight dedup + throttled fetch (via requestManager.fetchDeduped)
  const url = `${API_BASE_URL}/objects/${objectID}`;
  try {
    const response = await requestManager.fetchDeduped(url, signal);
    if (!response.ok) return null;
    const artwork = await response.json();
    const result = validateArtwork(artwork) ? artwork : null;
    if (result) await setCachedArtwork(objectID, result);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return null;
  }
}

// Batch fetch with parallel requests — uses requestManager.maxConcurrent for dynamic sizing
export async function batchFetchArtworks(objectIDs, targetCount = 4, signal = null) {
  const artworks = [];
  let idIndex = 0;

  while (artworks.length < targetCount && idIndex < objectIDs.length) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Batch size: 2x what we need, capped at current dynamic concurrency limit
    const remaining = targetCount - artworks.length;
    const batchSize = Math.min(
      requestManager.maxConcurrent,
      Math.max(remaining * 2, 4),
      objectIDs.length - idIndex
    );

    const batchIDs = objectIDs.slice(idIndex, idIndex + batchSize);
    idIndex += batchSize;

    // Parallel fetch — propagate AbortError, swallow everything else
    const results = await Promise.all(
      batchIDs.map(id => fetchArtworkByID(id, signal).catch(err => {
        if (err.name === 'AbortError') throw err;
        return null;
      }))
    );
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    artworks.push(...results.filter(Boolean));

    // Cooldown between batches — abort-aware, uses dynamic batchCooldownMs
    if (artworks.length < targetCount && idIndex < objectIDs.length) {
      await delayOrAbort(requestManager.batchCooldownMs, signal);
    }
  }

  return artworks.slice(0, targetCount);
}

export { API_BASE_URL };
