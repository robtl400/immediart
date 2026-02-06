/**
 * Met Museum Collection API Service
 * Handles all API communication with The Metropolitan Museum of Art Collection API
 */

const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';
const BATCH_DELAY_MS = 200; // Delay between requests

/**
 * Promise-based delay utility
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic for transient failures
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retries
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, retries = 3, signal = null) {
  for (let i = 0; i < retries; i++) {
    // Check if aborted before each attempt
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const response = await fetch(url, { signal });
      // If rate limited (403), wait longer before retry
      if (response.status === 403 && i < retries - 1) {
        await delay(1000 * (i + 1)); // 1s, 2s, 3s
        continue;
      }
      return response;
    } catch (error) {
      // Re-throw abort errors immediately
      if (error.name === 'AbortError') throw error;
      if (i === retries - 1) throw error;
      // Wait before retrying (500ms, 1000ms, 2000ms)
      await delay(500 * Math.pow(2, i));
    }
  }
}

/**
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetches object IDs from the search endpoint
 * @param {string} query - Search term (e.g., 'paintings', 'prints')
 * @returns {Promise<number[]>} Array of object IDs
 */
async function fetchSearchResults(query) {
  const url = `${BASE_URL}/search?hasImages=true&q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  const data = await response.json();
  return data.objectIDs || [];
}

/**
 * Fetches all painting IDs from the API
 * @returns {Promise<number[]>} Array of object IDs
 */
export const fetchAllObjectIDs = () => fetchSearchResults('paintings');

/**
 * Searches for artworks by artist name
 * @param {string} artistName - The artist's display name
 * @returns {Promise<number[]>} Array of object IDs
 */
export async function searchByArtist(artistName, signal = null) {
  try {
    const url = `${BASE_URL}/search?hasImages=true&artistOrCulture=true&q=${encodeURIComponent(artistName)}`;
    const response = await fetchWithRetry(url, 3, signal);
    if (!response.ok) {
      throw new Error(`Artist search failed: ${response.status}`);
    }
    const data = await response.json();
    return data.objectIDs || [];
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('searchByArtist error:', error);
    throw error;
  }
}

/**
 * Searches for artworks by tag/keyword
 * @param {string} tagTerm - The tag or keyword to search for
 * @returns {Promise<number[]>} Array of object IDs
 */
export async function searchByTag(tagTerm, signal = null) {
  try {
    const url = `${BASE_URL}/search?hasImages=true&q=${encodeURIComponent(tagTerm)}`;
    const response = await fetchWithRetry(url, 3, signal);
    if (!response.ok) {
      throw new Error(`Tag search failed: ${response.status}`);
    }
    const data = await response.json();
    return data.objectIDs || [];
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('searchByTag error:', error);
    throw error;
  }
}

/**
 * Validates artwork meets display requirements
 * @param {Object} artwork - Raw API response
 * @returns {boolean} True if valid for display
 */
export function validateArtwork(artwork) {
  return (
    artwork &&
    artwork.primaryImage &&
    artwork.primaryImage.trim() !== '' &&
    artwork.title &&
    artwork.title.trim() !== '' &&
    artwork.artistDisplayName &&
    artwork.artistDisplayName.trim() !== '' &&
    artwork.isPublicDomain === true
  );
}

/**
 * Fetches a single artwork by ID
 * @param {number} objectID - The object ID
 * @returns {Promise<Object|null>} Artwork data or null if invalid
 */
export async function fetchArtworkByID(objectID, signal = null) {
  try {
    const response = await fetchWithRetry(`${BASE_URL}/objects/${objectID}`, 3, signal);
    if (!response.ok) return null;
    const artwork = await response.json();
    return validateArtwork(artwork) ? artwork : null;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.warn(`Failed to fetch artwork ${objectID}:`, error);
    return null;
  }
}

/**
 * Fetches multiple artworks with delays to respect rate limits
 * @param {number[]} objectIDs - Array of IDs to fetch
 * @param {number} targetCount - Target number of valid artworks to return
 * @returns {Promise<Object[]>} Array of valid artworks
 */
export async function batchFetchArtworks(objectIDs, targetCount = 2, signal = null) {
  const artworks = [];

  for (let i = 0; i < objectIDs.length; i++) {
    // Check if aborted before each fetch
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Add delay BEFORE each request (except the first)
    if (i > 0) {
      await delay(BATCH_DELAY_MS);
    }

    const artwork = await fetchArtworkByID(objectIDs[i], signal);
    if (artwork) {
      artworks.push(artwork);
    }

    // Stop if we have enough valid artworks
    if (artworks.length >= targetCount) break;
  }

  return artworks;
}

export { BASE_URL };
