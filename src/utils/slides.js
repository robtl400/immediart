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

// Build up to `max` slides for a card: the primary image first, then any
// additionalImages (capped so a work with dozens of detail shots can't turn one
// card into an endless strip). Anonymous/empty entries are dropped.
export function buildSlides(artwork, max = 5) {
  const primary = {
    display: artwork.imageUrl,
    full: artwork.primaryImageFull || artwork.imageUrl,
  };
  const extras = (artwork.additionalImages || [])
    .filter((u) => typeof u === 'string' && u.trim())
    .slice(0, Math.max(0, max - 1))
    .map((full) => ({ display: toWebLarge(full), full }));
  return [primary, ...extras];
}
