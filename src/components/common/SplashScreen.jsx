import { useEffect, useRef } from 'react';
import flyingMachine from '../../assets/FlyingMachine2_tinted_gold.png';
import { TIMING, MAX_SCALE, RESIZE_END_FRACTION, buildFlightKeyframes } from './splashFlight';
import './SplashScreen.css';

/**
 * One-time launch animation.
 *
 * A single flying machine flies a full counter-clockwise loop-de-loop: it
 * climbs from off the bottom-left (large) up through the middle to the
 * top-right, crests just over the top edge (where most of the spin happens),
 * re-enters on the left and glides right, landing level in the banner's logo
 * slot as the logo. The "ImmediArt" wordmark fades in place beside it, and a
 * "Tap to skip" hint appears after a beat. The overlay then fades to reveal
 * the feed.
 *
 * The choreography (waypoints, timings — see splashFlight.js) runs on the Web
 * Animations API:
 *   - it lifts off only once the flier has decoded and the wordmark font has
 *     loaded (capped at READY_WAIT_MS), so the first frames never stall on a
 *     decode and the title never swaps fonts mid-fade;
 *   - the flier is laid out at its LARGEST on-screen size (MAX_SCALE logo
 *     heights) and only ever scaled DOWN, so its layer rasterises once, sharp,
 *     and the compositor plays the whole flight without repainting;
 *   - only transform and opacity animate — no filters, no visibility — the two
 *     properties every engine keeps off the main thread;
 *   - the overlay fade's `finished` promise ends the splash; a timeout backstop
 *     covers a wedged timeline.
 *
 * Purely decorative (aria-hidden) and skippable: tap anywhere, or press
 * Escape/Enter/Space (keyboard and switch users can't tap). It plays for
 * reduced-motion visitors too (owner's call for a personal app); the global
 * reduced-motion reset in index.css only reaches CSS animations.
 */

const fadeIn = (el, delay, duration, easing = 'ease') =>
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay, easing, fill: 'forwards' });

// The skip hint names the input the visitor has: a pointer that hovers is a
// mouse, and a keyboard beside it has the documented skip keys.
const skipHintText = () =>
  window.matchMedia?.('(hover: hover)').matches ? 'Click or press Esc to skip' : 'Tap to skip';

export default function SplashScreen({ onDone }) {
  const skipHint = useRef(skipHintText()).current;
  const overlayRef = useRef(null);
  const anchorRef  = useRef(null);
  const flierRef   = useRef(null);
  const titleRef   = useRef(null);
  const hintRef    = useRef(null);

  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    const overlay = overlayRef.current;
    const anchor  = anchorRef.current;
    const flier   = flierRef.current;

    // No Web Animations API (an old engine): nothing can fly — reveal the app.
    if (typeof flier?.animate !== 'function') {
      finish();
      return;
    }

    let cancelled = false;
    const animations = [];
    const backstop = setTimeout(finish, TIMING.BACKSTOP_MS);
    let capTimer = null;
    let onResize = null;

    const ready = Promise.all([
      flier.decode?.().catch(() => {}),
      document.fonts?.load?.('40px Allura').catch(() => {}),
    ]);
    const cap = new Promise((resolve) => { capTimer = setTimeout(resolve, TIMING.READY_WAIT_MS); });

    Promise.race([ready, cap]).then(() => {
      if (cancelled) return;

      // Lay the flier out at its largest size, centred on the landed logo's
      // box (the hidden anchor, which follows every banner breakpoint). The
      // flight only ever scales it down from here.
      const slot = anchor.getBoundingClientRect();
      const box  = overlay.getBoundingClientRect();
      const size = Math.max(1, Math.round(slot.height * MAX_SCALE));
      flier.style.width  = `${size}px`;
      flier.style.height = `${size}px`;
      flier.style.left   = `${slot.left - box.left + slot.width / 2 - size / 2}px`;
      flier.style.top    = `${slot.top - box.top + slot.height / 2 - size / 2}px`;

      // The keyframes are resolved to px for THIS viewport (see RESIZE_END_FRACTION).
      onResize = () => {
        const dw = Math.abs(overlay.clientWidth - box.width);
        const dh = Math.abs(overlay.clientHeight - box.height);
        if (dw > box.width * RESIZE_END_FRACTION || dh > box.height * RESIZE_END_FRACTION) finish();
      };
      window.addEventListener('resize', onResize);

      animations.push(
        flier.animate(buildFlightKeyframes(box.width, box.height), {
          duration: TIMING.FLIGHT_MS, easing: 'linear', fill: 'forwards',
        }),
        fadeIn(titleRef.current, TIMING.TITLE_DELAY_MS, TIMING.TITLE_MS),
        fadeIn(hintRef.current, TIMING.HINT_DELAY_MS, TIMING.HINT_MS),
      );
      const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: TIMING.FADE_MS, delay: TIMING.FADE_DELAY_MS, easing: 'ease', fill: 'forwards',
      });
      animations.push(fade);
      // Only the overlay fade ends the splash; cancel() rejects, which is fine.
      fade.finished.then(finish, () => {});
    });

    return () => {
      cancelled = true;
      clearTimeout(backstop);
      clearTimeout(capTimer);
      if (onResize) window.removeEventListener('resize', onResize);
      animations.forEach((a) => a.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard skip — CAPTURE phase + stopPropagation so the same keypress can't
  // also drive the feed's document-level shortcuts under the overlay (Enter
  // would otherwise both skip the splash and open the current card's modal).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={overlayRef}
      className="splash-screen"
      role="presentation"
      aria-hidden="true"
      onClick={finish}
    >
      {/* The crest is the banner's layout, reused so the landed logo and the
          wordmark line up with the real banner exactly. The anchor carries
          .banner-logo (so it follows every banner breakpoint) but stays
          hidden: it only marks where the flier lands. */}
      <div className="splash-crest">
        <img ref={anchorRef} src={flyingMachine} alt="" className="banner-logo splash-anchor" draggable={false} />
        <h1 ref={titleRef} className="banner-title splash-title">ImmediArt</h1>
      </div>
      <img ref={flierRef} src={flyingMachine} alt="" className="splash-flier" draggable={false} decoding="async" />
      <span ref={hintRef} className="splash-skip-hint">{skipHint}</span>
    </div>
  );
}
