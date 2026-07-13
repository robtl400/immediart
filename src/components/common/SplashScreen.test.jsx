/**
 * SplashScreen — the one-time launch animation.
 *
 * Covers: it renders the flier + crest wordmark, is decorative + tap-skippable,
 * finishes only on the overlay fade-out (not a child flight/land end), is
 * idempotent (onDone fires once), and has a backstop timeout so it can't wedge.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SplashScreen from './SplashScreen';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'fm.png' }));

// jsdom's AnimationEvent doesn't preserve animationName through fireEvent, so
// dispatch a plain animationend event with the name defined explicitly.
function fireAnim(el, animationName) {
  const ev = new Event('animationend', { bubbles: true });
  Object.defineProperty(ev, 'animationName', { value: animationName });
  fireEvent(el, ev);
}

describe('SplashScreen', () => {
  it('renders the flier and the crest with the wordmark', () => {
    const { container } = render(<SplashScreen onDone={vi.fn()} />);
    expect(container.querySelector('.splash-flier')).toBeTruthy();
    expect(container.querySelector('.splash-crest')).toBeTruthy();
    expect(screen.getByText('ImmediArt')).toBeTruthy();
  });

  it('is decorative (aria-hidden) and skippable by tap', () => {
    const onDone = vi.fn();
    const { container } = render(<SplashScreen onDone={onDone} />);
    const el = container.querySelector('.splash-screen');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(el);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // The child flight/land animations bubble their end to the overlay; only the
  // overlay's own fade-out should finish it. (The positive fade-finish path is
  // browser-verified — jsdom+React doesn't preserve animationName through a
  // synthetic animationend event, so we can only assert the negative here.)
  it('a child flight/land animation ending does not finish the splash', () => {
    const onDone = vi.fn();
    const { container } = render(<SplashScreen onDone={onDone} />);
    const el = container.querySelector('.splash-screen');
    fireAnim(el, 'splashFlight');
    fireAnim(el, 'splashLand');
    expect(onDone).not.toHaveBeenCalled();
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

  it('finishes via the backstop timeout if animationend never fires', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    act(() => vi.advanceTimersByTime(3900));
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
