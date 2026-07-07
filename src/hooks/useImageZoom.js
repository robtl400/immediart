import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * useImageZoom — zero-dependency pinch / pan / double-tap zoom for a single
 * image, driven by Pointer Events (so one code path covers touch, trackpad and
 * mouse).
 *
 *   - Pinch (2 fingers): scale about the pinch midpoint; the midpoint also pans,
 *     so pinch-and-drag feels natural. Applied frame-to-frame.
 *   - Double-tap / double-click: toggle between 1× and 2.5× at the tapped point.
 *   - Drag (1 finger / mouse) when zoomed: pan, clamped so the image can't be
 *     dragged past its own edges.
 *   - Ctrl+wheel (trackpad pinch / mouse): zoom about the cursor.
 *   - Keyboard: +/‑ zoom about centre, 0 resets.
 *
 * The live transform is written imperatively to the image element each frame (no
 * React re-render per move); only the `isZoomed` boolean is state, used to flip
 * the cursor. Reduced-motion callers get instant (un-animated) transforms.
 *
 * Usage:
 *   const zoom = useImageZoom();
 *   <div ref={zoom.containerRef} {...zoom.handlers} tabIndex={0}>
 *     <img ref={zoom.imgRef} />
 *   </div>
 * The container must have `touch-action: none` so multi-touch reaches us.
 */
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const clampScale = (s) => Math.max(1, Math.min(MAX_SCALE, s));

export default function useImageZoom() {
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  const view = useRef({ scale: 1, tx: 0, ty: 0 });
  const pointers = useRef(new Map());     // pointerId -> { x, y }
  const pinchPrev = useRef(null);         // { dist, midX, midY }
  const lastTapAt = useRef(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const apply = useCallback((animate) => {
    const img = imgRef.current;
    if (!img) return;
    const { scale, tx, ty } = view.current;
    img.style.transition = animate && !prefersReduced() ? 'transform 0.2s ease' : 'none';
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    const z = scale > 1.01;
    setIsZoomed((prev) => (prev === z ? prev : z));
  }, []);

  // Keep the (scaled) image within its own bounds — no panning into empty space.
  const clampTranslate = useCallback(() => {
    const img = imgRef.current;
    const v = view.current;
    if (!img) return;
    const maxX = Math.max(0, (img.offsetWidth * (v.scale - 1)) / 2);
    const maxY = Math.max(0, (img.offsetHeight * (v.scale - 1)) / 2);
    v.tx = Math.max(-maxX, Math.min(maxX, v.tx));
    v.ty = Math.max(-maxY, Math.min(maxY, v.ty));
  }, []);

  const reset = useCallback((animate = true) => {
    view.current = { scale: 1, tx: 0, ty: 0 };
    apply(animate);
  }, [apply]);

  // Zoom to `scale`, keeping the screen point (ox, oy) fixed under the finger.
  // The image is centred in the container at rest, so measuring the origin from
  // the container centre makes translate exact for `translate(t) scale(s)`.
  const zoomTo = useCallback((scale, ox, oy, animate) => {
    const el = containerRef.current;
    const v = view.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = clampScale(scale);
    const fx = ox - rect.left - rect.width / 2;
    const fy = oy - rect.top - rect.height / 2;
    const ratio = next / v.scale;
    v.tx = v.tx * ratio + fx * (1 - ratio);
    v.ty = v.ty * ratio + fy * (1 - ratio);
    v.scale = next;
    clampTranslate();
    apply(animate);
  }, [apply, clampTranslate]);

  const onPointerDown = useCallback((e) => {
    containerRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      // Any 2nd/3rd finger starts (or continues) a multi-touch gesture: reset the
      // pinch baseline and cancel a pending double-tap so an extra finger can't
      // fire the zoom toggle mid-pinch.
      pinchPrev.current = null;
      lastTapAt.current = 0;
      return;
    }

    // Single pointer: double-tap / double-click toggles zoom at the tapped point.
    const now = e.timeStamp;
    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      if (view.current.scale > 1.01) reset(true);
      else zoomTo(DOUBLE_TAP_SCALE, e.clientX, e.clientY, true);
      lastTapAt.current = 0;
    } else {
      lastTapAt.current = now;
    }
  }, [reset, zoomTo]);

  const onPointerMove = useCallback((e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      // First pinch frame, or a degenerate (coincident-pointer) baseline: just
      // (re)seed the baseline so the divisor below can never be zero → no NaN.
      if (!pinchPrev.current || pinchPrev.current.dist === 0) {
        pinchPrev.current = { dist, midX, midY };
        return;
      }

      const v = view.current;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nextScale = clampScale(v.scale * (dist / pinchPrev.current.dist));
      const fx = midX - rect.left - rect.width / 2;
      const fy = midY - rect.top - rect.height / 2;
      const ratio = nextScale / v.scale;
      // scale about the midpoint, then translate by the midpoint's own movement
      v.tx = v.tx * ratio + fx * (1 - ratio) + (midX - pinchPrev.current.midX);
      v.ty = v.ty * ratio + fy * (1 - ratio) + (midY - pinchPrev.current.midY);
      v.scale = nextScale;
      pinchPrev.current = { dist, midX, midY };
      clampTranslate();
      apply(false);
    } else if (view.current.scale > 1.01) {
      view.current.tx += cur.x - prev.x;
      view.current.ty += cur.y - prev.y;
      clampTranslate();
      apply(false);
    }
  }, [apply, clampTranslate]);

  const endPointer = useCallback((e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchPrev.current = null;
  }, []);

  // Wheel must be a NON-passive native listener: React 19 attaches onWheel as a
  // passive root listener, so e.preventDefault() there is ignored and the browser
  // would page-zoom on top of our image zoom. Attach directly on the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e) => {
      // Trackpad pinch arrives as ctrl+wheel; plain wheel is left to scroll.
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(view.current.scale * (1 - e.deltaY * 0.01), e.clientX, e.clientY, false);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [zoomTo]);

  const onKeyDown = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(view.current.scale + 0.5, cx, cy, true); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(view.current.scale - 0.5, cx, cy, true); }
    else if (e.key === '0') { e.preventDefault(); reset(true); }
  }, [zoomTo, reset]);

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onKeyDown,
  };

  return { containerRef, imgRef, handlers, isZoomed, reset };
}
