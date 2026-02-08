/**
 * Image preloading utilities
 */

// Preload single image, resolves when loaded or failed
export function preloadImage(url, signal = null) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);

    const img = new Image();
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      img.onload = null;
      img.onerror = null;
      if (signal) signal.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      img.src = ''; // Cancel the image load
      resolve(false);
    };

    img.onload = () => {
      cleanup();
      resolve(true);
    };

    img.onerror = () => {
      cleanup();
      resolve(false);
    };

    if (signal) signal.addEventListener('abort', handleAbort);
    img.src = url;
  });
}

// Preload all images for an array of artworks
export function preloadArtworkImages(artworks, signal = null) {
  return Promise.all(artworks.map(a => preloadImage(a.imageUrl, signal)));
}
