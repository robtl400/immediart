/**
 * SplashScreen — the one-time launch animation.
 *
 * Covers: it renders the flier, the crest anchor and the wordmark; is
 * decorative + tap/keyboard skippable; lifts off only once ready — and no later
 * than READY_WAIT_MS — with the flier laid out at its largest size over the
 * logo slot and scaled DOWN to land; finishes only on the overlay fade (not the
 * flight); is idempotent; has a backstop timeout; ends on a viewport change
 * past RESIZE_END_FRACTION but rides out smaller ones; cancels its animations
 * on unmount; and reveals the app at once where the Web Animations API is
 * missing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SplashScreen from './SplashScreen';
import { buildFlightKeyframes, MAX_SCALE, TIMING } from './splashFlight';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'fm.png' }));

// jsdom has no Web Animations API. Stub Element.animate with a controllable
// fake so tests can end the overlay fade (which finishes the splash) on cue.
let animations;
function installAnimateStub() {
  animations = [];
  Element.prototype.animate = vi.fn(function (keyframes, options) {
    let resolve, reject;
    const finished = new Promise((res, rej) => { resolve = res; reject = rej; });
    finished.catch(() => {}); // a cancelled animation rejects; never unhandled here
    const anim = { target: this, keyframes, options, finished, finish: () => resolve(), cancel: vi.fn(() => reject(new Error('cancelled'))) };
    animations.push(anim);
    return anim;
  });
}
const animationOn = (className) => animations.find(a => a.target.classList.contains(className));

// Rects for the layout the component measures: a 390x844 phone with the logo
// slot at (86, 15), 38px square.
const RECTS = {
  'splash-screen': { left: 0, top: 0, width: 390, height: 844 },
  'splash-anchor': { left: 86, top: 15, width: 38, height: 38 },
};
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

describe('SplashScreen', () => {
  beforeEach(() => {
    installAnimateStub();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const key = Object.keys(RECTS).find(k => this.classList.contains(k));
      return { ...(RECTS[key] ?? { left: 0, top: 0, width: 0, height: 0 }), right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
    });
  });
  afterEach(() => {
    delete Element.prototype.animate;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the flier, the crest anchor and the wordmark', () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    expect(container.querySelector('.splash-flier')).toBeTruthy();
    expect(container.querySelector('.splash-crest .splash-anchor')).toBeTruthy();
    expect(screen.getByText('ImmediArt')).toBeTruthy();
    expect(screen.getByText('Tap to skip')).toBeTruthy();
  });

  it('is decorative (aria-hidden) and skippable by tap', () => {
    const onDone = vi.fn();
    const { container } = render(<SplashScreen onDone={onDone} />);
    const el = container.querySelector('.splash-screen');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(el);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('is skippable by keyboard (Escape/Enter/Space) — capture-phase, does not leak to feed shortcuts', () => {
    const onDone = vi.fn();
    const feedShortcut = vi.fn();
    document.addEventListener('keydown', feedShortcut); // stands in for the feed's document-level handler
    render(<SplashScreen onDone={onDone} />);

    // Dispatch on body — real key events target the focused element and reach
    // window's capture listener FIRST (capture: window → document → target)
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onDone).toHaveBeenCalledTimes(1);
    // The capture-phase handler stops propagation — the feed never sees it
    expect(feedShortcut).not.toHaveBeenCalled();

    // Other keys are ignored (and propagate normally)
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(feedShortcut).toHaveBeenCalledTimes(1);

    document.removeEventListener('keydown', feedShortcut);
  });

  it('calls onDone at most once even if tapped repeatedly', () => {
    const onDone = vi.fn();
    const { container } = render(<SplashScreen onDone={onDone} />);
    const el = container.querySelector('.splash-screen');
    fireEvent.click(el);
    fireEvent.click(el);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lifts off once ready: flier laid out at MAX_SCALE logo heights over the slot, scaled DOWN to land, only transform/opacity animated', async () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    await flush();

    // Four animations: flight, wordmark, skip hint, overlay fade
    expect(Element.prototype.animate).toHaveBeenCalledTimes(4);

    // Layout box: 38px slot × 4.4 = 167px, centred on the slot's centre (105, 34)
    const flier = container.querySelector('.splash-flier');
    expect(flier.style.width).toBe('167px');
    expect(flier.style.height).toBe('167px');
    expect(flier.style.left).toBe('21.5px');
    expect(flier.style.top).toBe('-49.5px');

    const flight = animationOn('splash-flier');
    expect(flight.options).toMatchObject({ duration: TIMING.FLIGHT_MS, easing: 'linear', fill: 'forwards' });
    const first = flight.keyframes[0];
    const last  = flight.keyframes.at(-1);
    expect(first).toMatchObject({ offset: 0, opacity: 0 });
    expect(first.transform).toBe('translate(-179.4px, 675.2px) scale(1.0000) rotate(-8deg)'); // largest = scale 1, never above
    expect(last).toMatchObject({ offset: 1, opacity: 1 }); // lands VISIBLE (the element itself rests at opacity 0)
    expect(last.transform).toBe(`translate(0.0px, 0.0px) scale(${(1 / MAX_SCALE).toFixed(4)}) rotate(-360deg)`); // landed = the logo
    const animatedProps = new Set(flight.keyframes.flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing'].includes(k)));
    expect([...animatedProps].sort()).toEqual(['opacity', 'transform']);

    expect(animationOn('splash-title').options).toMatchObject({ delay: TIMING.TITLE_DELAY_MS, duration: TIMING.TITLE_MS });
    expect(animationOn('splash-skip-hint').options).toMatchObject({ delay: TIMING.HINT_DELAY_MS });
    expect(animationOn('splash-screen').options).toMatchObject({ delay: TIMING.FADE_DELAY_MS, duration: TIMING.FADE_MS });
  });

  it('finishes on the overlay fade only — the flight ending does not finish the splash', async () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    await flush();

    await act(async () => { animationOn('splash-flier').finish(); });
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => { animationOn('splash-screen').finish(); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('finishes via the backstop timeout if the fade never finishes', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(TIMING.BACKSTOP_MS - 1); });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('ends the splash on a real viewport change mid-flight (the keyframes are resolved in px)', async () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    await flush();
    // jsdom's clientWidth/clientHeight are 0 — a 100% change against the measured 390x844 box
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('rides out a small viewport change and ends only once one axis passes RESIZE_END_FRACTION', async () => {
    const onDone = vi.fn();
    const { container } = render(<SplashScreen onDone={onDone} />);
    await flush();

    // The overlay measured 390x844 at lift-off (RECTS). Give it live client
    // dimensions so the resize handler compares against a real box.
    const overlay = container.querySelector('.splash-screen');
    const setClientSize = (width, height) => {
      Object.defineProperty(overlay, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(overlay, 'clientHeight', { value: height, configurable: true });
    };

    // A settling mobile toolbar: ~5% off the height, under the 15% threshold
    setClientSize(390, 800);
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    expect(onDone).not.toHaveBeenCalled();

    // A real rotation/window change: >50% off the height, over the threshold
    setClientSize(390, 400);
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lifts off at READY_WAIT_MS even while the decode and the font are still pending', async () => {
    vi.useFakeTimers();
    // jsdom implements neither, so define both as promises that never settle
    const pending = () => new Promise(() => {});
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: pending, configurable: true });
    Object.defineProperty(document, 'fonts', { value: { load: pending }, configurable: true });

    try {
      render(<SplashScreen onDone={vi.fn()} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(TIMING.READY_WAIT_MS - 1); });
      expect(animations).toHaveLength(0);

      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(animations).toHaveLength(4); // flight, wordmark, skip hint, overlay fade
    } finally {
      delete HTMLImageElement.prototype.decode;
      delete document.fonts;
    }
  });

  it('cancels its animations on unmount (StrictMode double-mount, early skip)', async () => {
    const { unmount } = render(<SplashScreen onDone={vi.fn()} />);
    await flush();
    expect(animations).toHaveLength(4);
    unmount();
    animations.forEach(a => expect(a.cancel).toHaveBeenCalledTimes(1));
  });

  it('reveals the app at once where the Web Animations API is missing', () => {
    delete Element.prototype.animate;
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('buildFlightKeyframes', () => {
  it('resolves viewport fractions to px, keeps offsets ascending, and never scales above 1', () => {
    const frames = buildFlightKeyframes(390, 844);
    expect(frames.map(f => f.offset)).toEqual([...frames.map(f => f.offset)].sort((a, b) => a - b));
    expect(frames[0].offset).toBe(0);
    expect(frames.at(-1).offset).toBe(1);
    const scales = frames.filter(f => f.transform).map(f => Number(f.transform.match(/scale\(([\d.]+)\)/)[1]));
    expect(Math.max(...scales)).toBe(1);
    expect(Math.min(...scales)).toBeCloseTo(1 / MAX_SCALE, 4);
    // Easing only at lift-off and in the three landing segments
    expect(frames.filter(f => f.easing).map(f => f.offset)).toEqual([0, 0.77, 0.84, 0.89]);
    // The opacity-only keyframe carries no transform
    expect(frames[1]).toEqual({ offset: 0.06, opacity: 1 });
    // Every animated property is stated on the last keyframe, so nothing falls
    // back to the element's resting value (opacity 0) at the landing
    const props = new Set(frames.flatMap(f => Object.keys(f)).filter(k => !['offset', 'easing'].includes(k)));
    for (const p of props) expect(frames.at(-1)).toHaveProperty(p);
    expect(frames.at(-1).opacity).toBe(1);
  });
});
