/**
 * Data Transformation Utilities
 * Transforms Met Museum API data into display format for the app
 */

import { shuffleArray } from '../services/metAPI';

/**
 * Formats artist name as Instagram-style username
 * @param {string} artistName - e.g., "Vincent van Gogh"
 * @returns {string} e.g., "@Vincent_van_Gogh"
 */
export function formatArtistUsername(artistName) {
  if (!artistName) return '@Unknown_Artist';
  // Replace spaces with underscores
  const formatted = artistName.replace(/\s+/g, '_');
  return `@${formatted}`;
}

/**
 * Extracts up to N random tags from the tags array
 * @param {Array} tagsArray - API tags array with {term, AAT_URL, Wikidata_URL}
 * @param {number} count - Maximum tags to return
 * @returns {string[]} Array of tag terms (without # prefix)
 */
export function extractRandomTags(tagsArray, count = 4) {
  if (!tagsArray || !Array.isArray(tagsArray) || tagsArray.length === 0) {
    return [];
  }

  // Shuffle and take first N
  const shuffled = shuffleArray(tagsArray);
  return shuffled
    .slice(0, count)
    .map(tag => tag.term)
    .filter(term => term && term.trim());
}

/**
 * Builds the main description text from artwork metadata
 * @param {Object} artwork - API artwork object
 * @returns {string} Combined description
 */
export function buildDescription(artwork) {
  const parts = [];

  if (artwork.title) parts.push(artwork.title);
  if (artwork.medium) parts.push(artwork.medium);
  if (artwork.objectDate) parts.push(artwork.objectDate);
  if (artwork.culture) parts.push(artwork.culture);
  if (artwork.period) parts.push(artwork.period);

  return parts.join('. ');
}

/**
 * Builds comment-style entries from metadata
 * @param {Object} artwork - API artwork object
 * @returns {Array} Array of comment objects
 */
export function buildComments(artwork) {
  const comments = [];

  // Department comment with gallery info
  if (artwork.department) {
    const deptUsername = `@${artwork.department.replace(/\s+/g, '')}`;
    let text;

    if (artwork.GalleryNumber) {
      text = `Currently on display in Gallery ${artwork.GalleryNumber} - come visit us!`;
    } else {
      text = 'Not currently on view';
    }

    comments.push({ username: deptUsername, text });
  }

  // Credit line comment
  if (artwork.creditLine) {
    comments.push({
      username: '@TheMetMuseum',
      text: artwork.creditLine
    });
  }

  // Rights and reproduction (only if exists)
  if (artwork.rightsAndReproduction && artwork.rightsAndReproduction.trim()) {
    comments.push({
      username: '@TheMetMuseum',
      text: artwork.rightsAndReproduction
    });
  }

  return comments;
}

/**
 * Transforms Met API artwork data to display format
 * @param {Object} apiArtwork - Raw API response
 * @returns {Object} Transformed artwork for UI display
 */
export function transformAPIToDisplay(apiArtwork) {
  return {
    // Core display fields
    id: apiArtwork.objectID,
    imageUrl: apiArtwork.primaryImageSmall || apiArtwork.primaryImage,
    artistName: apiArtwork.artistDisplayName,
    username: formatArtistUsername(apiArtwork.artistDisplayName),
    title: apiArtwork.title,
    description: buildDescription(apiArtwork),
    date: apiArtwork.objectDate || '',
    tags: extractRandomTags(apiArtwork.tags, 4),
    comments: buildComments(apiArtwork),

    // Additional metadata (stored for future use)
    medium: apiArtwork.medium || '',
    culture: apiArtwork.culture || '',
    period: apiArtwork.period || '',
    department: apiArtwork.department || '',
    gallery: apiArtwork.GalleryNumber || null,
    creditLine: apiArtwork.creditLine || '',
    isHighlight: apiArtwork.isHighlight || false,
    primaryImageFull: apiArtwork.primaryImage || '',
    objectName: apiArtwork.objectName || '',
    portfolio: apiArtwork.portfolio || '',
    artistBeginDate: apiArtwork.artistBeginDate || '',
    dimensions: apiArtwork.dimensions || '',
    city: apiArtwork.city || '',
    state: apiArtwork.state || '',
    country: apiArtwork.country || '',
    region: apiArtwork.region || '',
    subregion: apiArtwork.subregion || '',
    repository: apiArtwork.repository || ''
  };
}
