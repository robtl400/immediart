/**
 * ImageCarousel — multi-image feed carousel.
 *
 * Covers: one slide + one dot per image, opening the modal on the *current*
 * slide's full-res URL (click and keyboard), the onError → full-res fallback,
 * primary-image onLoad plumbing, and dot/arrow paging (scrollTo is stubbed since
 * jsdom doesn't implement it).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ImageCarousel from './ImageCarousel';

const SLIDES = [
  { display: 'https://x/small.jpg', full: 'https://x/full.jpg' },
  { display: 'https://images.metmuseum.org/CRDImages/ep/web-large/a.jpg', full: 'https://images.metmuseum.org/CRDImages/ep/original/a.jpg' },
  { display: 'https://x/c-web.jpg', full: 'https://x/c-full.jpg' },
];

let scrollToSpy;
beforeEach(() => {
  scrollToSpy = vi.fn();
  Element.prototype.scrollTo = scrollToSpy;
});
afterEach(() => {
  delete Element.prototype.scrollTo;
});

function setup(props = {}) {
  return render(
    <ImageCarousel
      slides={SLIDES}
      alt="Starry Night by Van Gogh"
      frameClass="landscape"
      onPrimaryLoad={props.onPrimaryLoad || vi.fn()}
      onOpen={props.onOpen || vi.fn()}
    />
  );
}

describe('ImageCarousel', () => {
  it('renders one image and one dot per slide', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.carousel-slide img')).toHaveLength(3);
    expect(container.querySelectorAll('.carousel-dot')).toHaveLength(3);
  });

  it('shows the current-slide counter', () => {
    const { container } = setup();
    expect(container.querySelector('.carousel-count').textContent).toBe('1/3');
  });

  it('opens the modal on a slide with that slide\'s full-res URL (click)', () => {
    const onOpen = vi.fn();
    const { container } = setup({ onOpen });
    const imgs = container.querySelectorAll('.carousel-slide img');
    fireEvent.click(imgs[1]);
    expect(onOpen).toHaveBeenCalledWith(SLIDES[1].full);
  });

  it('opens the modal via keyboard (Enter) on the focused slide', () => {
    const onOpen = vi.fn();
    const { container } = setup({ onOpen });
    const imgs = container.querySelectorAll('.carousel-slide img');
    fireEvent.keyDown(imgs[2], { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(SLIDES[2].full);
  });

  it('falls back to the full-res URL when a web-large slide fails to load', () => {
    const { container } = setup();
    const img = container.querySelectorAll('.carousel-slide img')[1];
    expect(img.getAttribute('src')).toBe(SLIDES[1].display);
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(SLIDES[1].full);
  });

  it('calls onPrimaryLoad only for the first slide', () => {
    const onPrimaryLoad = vi.fn();
    const { container } = setup({ onPrimaryLoad });
    const imgs = container.querySelectorAll('.carousel-slide img');
    fireEvent.load(imgs[1]);
    expect(onPrimaryLoad).not.toHaveBeenCalled();
    fireEvent.load(imgs[0]);
    expect(onPrimaryLoad).toHaveBeenCalledTimes(1);
  });

  it('a dot pages the strip via scrollTo', () => {
    const { container } = setup();
    fireEvent.click(container.querySelectorAll('.carousel-dot')[2]);
    expect(scrollToSpy).toHaveBeenCalled();
  });

  it('ArrowRight / ArrowLeft page the strip', () => {
    const { container } = setup();
    const frame = container.querySelector('.image-container.carousel');
    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    expect(scrollToSpy).toHaveBeenCalled();
  });
});
