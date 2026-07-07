/**
 * useImageZoom — keyboard-driven zoom (the deterministic surface of the hook).
 *
 * Pinch/pan/double-tap depend on live pointer geometry (getBoundingClientRect,
 * multi-touch timing) that jsdom can't provide meaningfully, so those are
 * verified in-browser. Here we cover the parts that are pure state/transform
 * wiring: the returned shape, +/- zoom, the isZoomed flag, and 0 to reset.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import useImageZoom from './useImageZoom';

function Harness() {
  const { containerRef, imgRef, handlers, isZoomed } = useImageZoom();
  return (
    <div ref={containerRef} {...handlers} tabIndex={0} data-testid="vp">
      <img ref={imgRef} data-testid="img" alt="" />
      <span data-testid="zoomed">{String(isZoomed)}</span>
    </div>
  );
}

const img = () => screen.getByTestId('img');
const vp = () => screen.getByTestId('vp');
const zoomedFlag = () => screen.getByTestId('zoomed').textContent;

describe('useImageZoom — keyboard', () => {
  it('starts un-zoomed with no transform', () => {
    render(<Harness />);
    expect(zoomedFlag()).toBe('false');
    expect(img().style.transform).toBe('');
  });

  it('+ zooms in past 1× and flips isZoomed true', () => {
    render(<Harness />);
    fireEvent.keyDown(vp(), { key: '+' });
    expect(img().style.transform).toContain('scale(1.5)');
    expect(zoomedFlag()).toBe('true');
  });

  it('0 resets to 1× and isZoomed false', () => {
    render(<Harness />);
    fireEvent.keyDown(vp(), { key: '+' });
    fireEvent.keyDown(vp(), { key: '0' });
    expect(img().style.transform).toContain('scale(1)');
    expect(zoomedFlag()).toBe('false');
  });

  it('- cannot zoom below 1× (clamped)', () => {
    render(<Harness />);
    fireEvent.keyDown(vp(), { key: '-' });
    expect(img().style.transform).toContain('scale(1)');
    expect(zoomedFlag()).toBe('false');
  });
});

describe('useImageZoom — wheel', () => {
  it('ctrl+wheel (trackpad pinch) zooms; the listener must be non-passive', () => {
    render(<Harness />);
    // deltaY < 0 zooms in. This rides the native non-passive listener that works
    // around React 19 attaching onWheel passively.
    fireEvent.wheel(vp(), { ctrlKey: true, deltaY: -100 });
    expect(img().style.transform).toContain('scale(2)');
    expect(zoomedFlag()).toBe('true');
  });

  it('plain wheel (no ctrl) does not zoom — left to scroll', () => {
    render(<Harness />);
    fireEvent.wheel(vp(), { deltaY: -100 });
    expect(img().style.transform).toBe('');
    expect(zoomedFlag()).toBe('false');
  });
});
