import { useRef, useState, useEffect, useCallback } from 'react';
import { activateOnKey } from '../../utils/keyboard';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Horizontal image carousel for feed cards that have more than one image
 * (primary + additionalImages). A CSS scroll-snap strip does the actual paging
 * — native momentum on touch, no gesture library — while this component only:
 *   - tracks the active slide from scrollLeft (rAF-throttled) to light the dots,
 *   - exposes ←/→ keys and tappable dots to page programmatically,
 *   - opens the modal on the *current* image (onOpen receives that slide's
 *     full-res URL, so the modal shows what the user was looking at).
 *
 * Dots live in a strip below the frame (outside the image); a small "n/total"
 * counter overlays the top-right corner. The frame height matches single-image
 * cards (landscape/portrait), with slides letterboxed (object-fit: contain) so
 * mixed aspect ratios all show the whole work.
 */
export default function ImageCarousel({ slides, alt, frameClass, onPrimaryLoad, onOpen }) {
  const trackRef = useRef(null);
  const rafRef = useRef(0);
  const [active, setActive] = useState(0);

  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track || track.clientWidth === 0) return;
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      setActive((prev) => {
        const next = Math.max(0, Math.min(idx, slides.length - 1));
        return prev === next ? prev : next;
      });
    });
  }, [slides.length]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const goTo = useCallback((i) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(i, slides.length - 1));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: prefersReduced() ? 'auto' : 'smooth' });
  }, [slides.length]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1); }
  };

  return (
    <>
      <div
        className={`image-container carousel ${frameClass}`}
        onKeyDown={onKeyDown}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${alt} — ${slides.length} images`}
      >
        <div className="carousel-track" ref={trackRef} onScroll={handleScroll}>
          {slides.map((slide, i) => (
            <div className="carousel-slide" key={i}>
              <img
                src={slide.display}
                alt={i === 0 ? alt : `${alt} — view ${i + 1} of ${slides.length}`}
                className="artwork-image carousel-image"
                onLoad={i === 0 ? onPrimaryLoad : undefined}
                onError={(e) => { if (slide.full && e.currentTarget.src !== slide.full) e.currentTarget.src = slide.full; }}
                onClick={() => onOpen(slide.full)}
                role="button"
                tabIndex={0}
                aria-label={`Open details for ${alt}`}
                onKeyDown={activateOnKey(() => onOpen(slide.full))}
                loading="lazy"
                draggable={false}
              />
            </div>
          ))}
        </div>
        <span className="carousel-count" aria-hidden="true">{active + 1}/{slides.length}</span>
      </div>

      <div className="carousel-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`carousel-dot${i === active ? ' active' : ''}`}
            onClick={() => goTo(i)}
            aria-label={`View image ${i + 1} of ${slides.length}`}
            aria-current={i === active}
          />
        ))}
      </div>
    </>
  );
}
