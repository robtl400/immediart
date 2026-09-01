/**
 * Carousel slide model.
 *
 * Met image URLs come in size variants under a path segment: `.../original/...`
 * is full resolution, `.../web-large/...` is the display-sized copy. The primary
 * image already arrives web-large (primaryImageSmall), but additionalImages are
 * full-res originals — heavy to load inline. Each slide therefore carries two
 * URLs: `display` (the lighter copy the feed loads) and `full` (the original the
 * modal opens and the pinch-zoom magnifies).
 */

// Swap an original-res Met URL for its web-large variant. Non-Met or already
// web-large URLs pass through unchanged (the replace simply no-ops).
export function toWebLarge(url) {
  return typeof url === 'string' ? url.replace('/original/', '/web-large/') : url;
}

// Met additionalImages include conservation photography — X-rays, infrared
// reflectograms, ultraviolet shots, the back of the panel — filed under the
// same object. Those are research records, not views of the work; as feed
// slides they read as broken images. The Met marks them in the filename.
// Detail crops (`_det`) stay: a close-up of the brushwork is a good slide.
const CONSERVATION_IMAGE = /(^|[-_.\s])(x-?ray|irr|uv|verso)(?=[-_.\s]|$)/i;
export function isConservationImage(url) {
  const last = url.split('/').pop() || '';
  let file;
  try {
    file = decodeURIComponent(last);
  } catch {
    file = last; // a malformed escape is not evidence of anything — judge the raw name
  }
  return CONSERVATION_IMAGE.test(file.replace(/\.[a-z0-9]+$/i, ''));
}

// Build up to `max` slides for a card: the primary image first, then any
// additionalImages (capped so a work with dozens of detail shots can't turn one
// card into an endless strip). Anonymous/empty entries and conservation
// photography are dropped.
export function buildSlides(artwork, max = 5) {
  const primary = {
    display: artwork.imageUrl,
    full: artwork.primaryImageFull || artwork.imageUrl,
  };
  const extras = (artwork.additionalImages || [])
    .filter((u) => typeof u === 'string' && u.trim() && !isConservationImage(u))
    .slice(0, Math.max(0, max - 1))
    .map((full) => ({ display: toWebLarge(full), full }));
  return [primary, ...extras];
}
