/**
 * Data transformers - API to display format
 */

import { shuffleArray } from '../services/metAPI';

// Format artist name as username: "Vincent van Gogh" → "@vincent_van_gogh"
export function formatArtistUsername(artistName) {
  if (!artistName) return '@Unknown_Artist';
  const formatted = artistName
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_+$/, '')
    .replace(/^_+/, '');
  return formatted ? `@${formatted}` : '@Unknown_Artist';
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
  const dept = artwork.department;
  const bio  = artwork.artistDisplayBio?.trim();
  if (!dept && !bio) return [];

  let text;
  if (dept && bio) {
    const t = [
      `From our ${dept} collection. ${bio}.`,
      `${bio} — part of the ${dept} collection.`,
      `${bio}. A work from the ${dept} department.`,
      `Part of the ${dept} collection. ${bio}.`,
    ];
    text = t[(artwork.objectID ?? 0) % t.length];
  } else if (dept) {
    const t = [
      `From the ${dept} department.`,
      `Part of the ${dept} collection.`,
      `A work from the ${dept} collection.`,
    ];
    text = t[(artwork.objectID ?? 0) % t.length];
  } else {
    text = `${bio}.`;
  }

  return [{ username: '@TheMetMuseum', text }];
}

// Transform API response to display format
export function transformAPIToDisplay(apiArtwork) {
  return {
    // Core fields
    id: apiArtwork.objectID,
    imageUrl: apiArtwork.primaryImageSmall || apiArtwork.primaryImage,
    artistName: apiArtwork.artistDisplayName || '',
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
    repository: apiArtwork.repository || '',
    artistBio: apiArtwork.artistDisplayBio || '',
    artistULAN_URL: apiArtwork.artistULAN_URL || '',
    objectURL: apiArtwork.objectURL || '',
    accessionYear: apiArtwork.accessionYear || '',
    additionalImages: apiArtwork.additionalImages || [], // reserved for A-4 carousel — see TODOS.md
    constituents: apiArtwork.constituents || [] // reserved for A-5 tagged contributors — see design plan
  };
}
