/**
 * Launch splash choreography — the numbers behind SplashScreen.jsx, kept in a
 * plain module so they can be unit-tested and so the component file exports
 * only a component (fast refresh).
 */

export const TIMING = {
  FLIGHT_MS:      2800,
  TITLE_DELAY_MS: 550,
  TITLE_MS:       800,
  HINT_DELAY_MS:  1000,
  HINT_MS:        400,
  FADE_DELAY_MS:  3000,
  FADE_MS:        500,
  READY_WAIT_MS:  300, // cap on waiting for decode + font before lift-off
};
TIMING.BACKSTOP_MS = TIMING.READY_WAIT_MS + TIMING.FADE_DELAY_MS + TIMING.FADE_MS + 400;

// A viewport change larger than this fraction of the overlay, on either axis,
// ends the splash: the px keyframes were resolved for the old box and would
// land the flier on a slot that has moved. A settling mobile toolbar moves a
// few percent and stays under it.
export const RESIZE_END_FRACTION = 0.15;

// The flier's largest on-screen size, in landed-logo heights. Its layout box
// is sized to this, so keyframe scale 1 = this size and the landing = 1/MAX.
export const MAX_SCALE = 4.4;

// Waypoints: x/y as fractions of the viewport (width/height) relative to the
// landing slot, s in logo heights, r in degrees. Offsets are allocated
// proportional to the distance flown (constant visible cruise speed); the
// base easing is linear, and easing exists only at lift-off (accelerate to
// cruise) and in the landing chain — three velocity-matched decelerating
// curves whose hand-off speeds match (an overshoot bounce read as a jolt, so
// the settle is monotonic). Rotation stays near level through the visible
// climb and is concentrated at the loop's crest, where a loop-de-loop spins.
const WAYPOINTS = [
  { at: 0,    x: -0.46, y: 0.80,  s: 4.4,  r: -8,   opacity: 0, easing: 'cubic-bezier(0.4, 0, 0.7, 0.7)' },
  { at: 0.06, opacity: 1 },
  { at: 0.16, x: -0.24, y: 0.52,  s: 3.3,  r: -14 },                       // climbing, near level
  { at: 0.33, x: 0.08,  y: 0.24,  s: 2.5,  r: -22 },                       // mid-screen, still gentle
  { at: 0.46, x: 0.32,  y: 0.02,  s: 2.1,  r: -50 },                       // upper-right, pulling up
  { at: 0.55, x: 0.44,  y: -0.14, s: 1.9,  r: -100 },                      // nose past vertical, cresting
  { at: 0.62, x: 0.24,  y: -0.24, s: 1.8,  r: -180 },                      // inverted over the top (brief)
  { at: 0.68, x: 0,     y: -0.20, s: 1.7,  r: -250 },                      // coming back over, leftward
  { at: 0.77, x: -0.18, y: -0.06, s: 1.55, r: -305, easing: 'cubic-bezier(0.3, 0.33, 0.7, 0.78)' }, // diving back in
  { at: 0.84, x: -0.16, y: 0.06,  s: 1.35, r: -338, easing: 'cubic-bezier(0.3, 0.38, 0.67, 0.7)' }, // pull-out below the banner
  { at: 0.89, x: -0.06, y: 0.04,  s: 1.15, r: -354, easing: 'cubic-bezier(0.24, 0.5, 0.6, 1)' },   // final glide, ease to rest
  // The landing keyframe states opacity explicitly: a property missing from
  // the last keyframe gets an implicit one holding the element's own computed
  // value, and .splash-flier rests at opacity 0 — without this the flier would
  // fade out across the whole flight and land invisible.
  { at: 1,    x: 0,     y: 0,     s: 1,    r: -360, opacity: 1 },          // landed, level = the logo
];

// Resolve the waypoints into Web Animations keyframes for a viewport of the
// given size. Transform functions keep one fixed order (translate, scale,
// rotate) so every engine can interpolate them on the compositor.
export function buildFlightKeyframes(viewportWidth, viewportHeight) {
  return WAYPOINTS.map((w) => {
    const frame = { offset: w.at };
    if (w.x !== undefined) {
      const x = (w.x * viewportWidth).toFixed(1);
      const y = (w.y * viewportHeight).toFixed(1);
      frame.transform = `translate(${x}px, ${y}px) scale(${(w.s / MAX_SCALE).toFixed(4)}) rotate(${w.r}deg)`;
    }
    if (w.opacity !== undefined) frame.opacity = w.opacity;
    if (w.easing) frame.easing = w.easing;
    return frame;
  });
}
