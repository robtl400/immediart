/**
 * Launch-animation gate.
 *
 * The welcome splash plays once per page load (App is the SPA root, so it mounts
 * once and never remounts on in-app navigation — gating on App's initial state is
 * enough). It is skipped entirely for visitors who prefer reduced motion.
 *
 * To change the cadence later: swap the App-state gate for a sessionStorage flag
 * (once per session) or a localStorage flag (once ever).
 */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
