/**
 * Adaptive feed-frame aspect: the card's box follows the image's own aspect
 * ratio, clamped so extremes crop their edges in (object-fit: cover) instead
 * of the old fixed-height frames cramming a panorama into a near-square and
 * upscaling the ~600px web-large source into visible pixelation.
 */

export const FRAME_WIDE_CAP = 16 / 10; // wider than this → sides crop in
export const FRAME_TALL_CAP = 4 / 5;   // taller than this → top/bottom crop in

export const clampFrameAspect = (width, height) =>
  Math.min(FRAME_WIDE_CAP, Math.max(FRAME_TALL_CAP, width / height));
