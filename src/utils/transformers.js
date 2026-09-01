/**
 * Data transformers - API to display format
 */

import { shuffleArray } from './shuffle';
import { clampFrameAspect } from './frameAspect';

// Format artist name as username: "Vincent van Gogh" → "@vincent_van_gogh"
export function formatArtistUsername(artistName) {
  if (!artistName) return '@unknown_artist';
  const formatted = artistName
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_+$/, '')
    .replace(/^_+/, '');
  return formatted ? `@${formatted}` : '@unknown_artist';
}

// Extract random tags from API tags array
function extractRandomTags(tagsArray, count = 5) {
  if (!tagsArray?.length) return [];
  return shuffleArray(tagsArray)
    .slice(0, count)
    .map(tag => tag.term)
    .filter(term => term?.trim());
}

// Build description from artwork metadata
function buildDescription(artwork) {
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

// A provisional frame aspect from the object's catalogued dimensions, so a
// card renders at close to its final height before its image arrives (the
// image's own pixel size corrects it on load). Only a flat measurement (a
// height and a width, no depth) is trusted: a vase's footprint says nothing
// about how its photograph is framed. null keeps the square placeholder.
function seedFrameAspect(apiArtwork) {
  const m = (apiArtwork.measurements || []).find((x) => {
    const d = x?.elementMeasurements;
    return d?.Height > 0 && d?.Width > 0 && !(d.Depth > 0);
  });
  return m ? clampFrameAspect(m.elementMeasurements.Width, m.elementMeasurements.Height) : null;
}

// Transform API response to display format
export function transformAPIToDisplay(apiArtwork) {
  return {
    // Core fields
    id: apiArtwork.objectID,
    imageUrl: apiArtwork.primaryImageSmall || apiArtwork.primaryImage,
    frameAspect: seedFrameAspect(apiArtwork),
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
    dimensions: apiArtwork.dimensions || '',
    city: apiArtwork.city || '',
    state: apiArtwork.state || '',
    country: apiArtwork.country || '',
    artistBio: apiArtwork.artistDisplayBio || '',
    artistULAN_URL: apiArtwork.artistULAN_URL || '',
    objectURL: apiArtwork.objectURL || '',
    additionalImages: apiArtwork.additionalImages || [],
  };
}

// "Title by Artist", or just the title for anonymous works (a large share of
// the collection has no named artist). The alt text, share sheet and modal
// caption all use it.
export const artworkCaption = (artwork) =>
  artwork.artistName ? `${artwork.title} by ${artwork.artistName}` : artwork.title;
