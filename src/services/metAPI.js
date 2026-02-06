/**
 * Met Museum Collection API Service
 * Handles all API communication with The Metropolitan Museum of Art Collection API
 */

const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 75;

/**
 * Promise-based delay utility
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fisher-Yates shuffle for randomizing arrays
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
 * Fetches and combines IDs for paintings and prints
 * @returns {Promise<number[]>} Combined, deduplicated array of IDs
 */
export async function fetchAllObjectIDs() {
  const paintingIDs = await fetchSearchResults('paintings');
  return paintingIDs;
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
export async function fetchArtworkByID(objectID) {
  try {
    const response = await fetch(`${BASE_URL}/objects/${objectID}`);
    if (!response.ok) return null;
    const artwork = await response.json();
    return validateArtwork(artwork) ? artwork : null;
  } catch (error) {
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
export async function batchFetchArtworks(objectIDs, targetCount = BATCH_SIZE) {
  const artworks = [];

  for (const id of objectIDs) {
    const artwork = await fetchArtworkByID(id);
    if (artwork) {
      artworks.push(artwork);
    }

    // Stop if we have enough valid artworks
    if (artworks.length >= targetCount) break;

    // Add delay between requests
    await delay(BATCH_DELAY_MS);
  }

  return artworks;
}

export { BASE_URL, BATCH_SIZE };
