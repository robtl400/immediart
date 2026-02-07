/**
 * Data transformers - API to display format
 */

import { shuffleArray } from '../services/metAPI';

// Format artist name as username: "Vincent van Gogh" → "@vincent_van_gogh"
export function formatArtistUsername(artistName) {
  if (!artistName) return '@Unknown_Artist';
  const formatted = artistName.toLowerCase().replace(/\s+/g, '_').replace('-', '_').replace(/\s*\(.*?\)\s*/g, '');
  return `@${formatted}`;
}

// Extract random tags from API tags array
export function extractRandomTags(tagsArray, count = 5) {
  if (!tagsArray?.length) return [];
  return shuffleArray(tagsArray)
    .slice(0, count)
    .map(tag => tag.term)
    .filter(term => term?.trim());
}

// Build description from artwork metadata
export function buildDescription(artwork) {
  return [artwork.title, artwork.medium, artwork.culture, artwork.period]
    .filter(Boolean)
    .join('. ');
}

// Build comments array
export function buildComments(artwork) {
  if (!artwork.department) return [];

  const text = artwork.GalleryNumber
    ? `From the ${artwork.department} department and currently on display in Gallery ${artwork.GalleryNumber} - come visit us!`
    : `From the ${artwork.department} department! ${artwork.creditLine} ${artwork.rightsAndReproduction}`;

  return [{ username: '@TheMetMuseum', text }];
}

// Transform API response to display format
export function transformAPIToDisplay(apiArtwork) {
  return {
    // Core fields
    id: apiArtwork.objectID,
    imageUrl: apiArtwork.primaryImageSmall || apiArtwork.primaryImage,
    artistName: apiArtwork.artistDisplayName,
    username: formatArtistUsername(apiArtwork.artistDisplayName),
    title: apiArtwork.title,
    description: buildDescription(apiArtwork),
    date: apiArtwork.objectDate || '',
    tags: extractRandomTags(apiArtwork.tags, 4),
    comments: buildComments(apiArtwork),

    // Metadata
    medium: apiArtwork.medium || '',
    culture: apiArtwork.culture || '',
    period: apiArtwork.period || '',
    dynasty: apiArtwork.dynasty || '',
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
