/**
 * Image preloading utilities
 */

// Preload single image, resolves when loaded or failed
export function preloadImage(url, signal = null) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);

    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;

    signal?.addEventListener('abort', () => resolve(false));
  });
}

// Preload all images for an array of artworks
export function preloadArtworkImages(artworks, signal = null) {
  return Promise.all(artworks.map(a => preloadImage(a.imageUrl, signal)));
}
