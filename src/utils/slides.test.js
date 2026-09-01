/**
 * slides.js — carousel slide model
 *
 * Covers: web-large URL substitution, primary-first ordering, the 5-slide cap,
 * empty/garbage additionalImages filtering, and the full-res URL carried for the
 * modal/zoom.
 */

import { describe, it, expect } from 'vitest';
import { toWebLarge, buildSlides, isConservationImage } from './slides';

describe('isConservationImage', () => {
  const base = 'https://images.metmuseum.org/CRDImages/ep/original/';
  it.each([
    'LC-49_7_20a_c-XRAY_det.jpg',
    'LC-49_7_20a_c-IRR.jpg',
    'DP-1234-UV.jpg',
    'sauvage verso.jpg',
    'DP-1_x-ray.jpg',
  ])('flags %s', (file) => {
    expect(isConservationImage(base + encodeURIComponent(file))).toBe(true);
  });

  it.each([
    'DP-1234.jpg',
    'LC-49_7_20a_c-5.jpg',
    'DP-1234_det.jpg',   // a detail crop is a real view of the work
    'irrigation-canal.jpg', // "irr" must match a whole token, not a prefix
    'Curve.jpg',
  ])('passes %s', (file) => {
    expect(isConservationImage(base + file)).toBe(false);
  });

  it('never throws on a malformed percent-escape (one bad Met URL must not take down the feed)', () => {
    expect(() => isConservationImage(base + 'DP-1%E0%A4%A.jpg')).not.toThrow();
    expect(isConservationImage(base + 'bad%2-XRAY.jpg')).toBe(true); // still judged on the raw name
  });
});

const ORIG = 'https://images.metmuseum.org/CRDImages/ep/original/DP-1.jpg';
const WEB = 'https://images.metmuseum.org/CRDImages/ep/web-large/DP-1.jpg';

describe('toWebLarge', () => {
  it('swaps /original/ for /web-large/', () => {
    expect(toWebLarge(ORIG)).toBe(WEB);
  });

  it('leaves a non-original URL unchanged', () => {
    expect(toWebLarge(WEB)).toBe(WEB);
  });

  it('passes non-string input through', () => {
    expect(toWebLarge(null)).toBe(null);
    expect(toWebLarge(undefined)).toBe(undefined);
  });
});

const artwork = (overrides = {}) => ({
  imageUrl: 'https://x/small.jpg',
  primaryImageFull: 'https://x/full.jpg',
  additionalImages: [],
  ...overrides,
});

describe('buildSlides', () => {
  it('returns a single primary slide when there are no additional images', () => {
    const slides = buildSlides(artwork());
    expect(slides).toHaveLength(1);
    expect(slides[0]).toEqual({ display: 'https://x/small.jpg', full: 'https://x/full.jpg' });
  });

  it('falls back to imageUrl for full when primaryImageFull is absent', () => {
    const slides = buildSlides(artwork({ primaryImageFull: '' }));
    expect(slides[0].full).toBe('https://x/small.jpg');
  });

  it('places the primary first, then additionalImages (web-large for display)', () => {
    const slides = buildSlides(artwork({ additionalImages: [ORIG] }));
    expect(slides).toHaveLength(2);
    expect(slides[1]).toEqual({ display: WEB, full: ORIG });
  });

  it('caps at 5 slides (primary + 4 extras) even with more images', () => {
    const many = Array.from({ length: 10 }, (_, i) => `https://images.metmuseum.org/CRDImages/ep/original/x${i}.jpg`);
    const slides = buildSlides(artwork({ additionalImages: many }));
    expect(slides).toHaveLength(5);
  });

  it('respects a custom max', () => {
    const many = ['a', 'b', 'c'].map((n) => `https://x/${n}.jpg`);
    expect(buildSlides(artwork({ additionalImages: many }), 2)).toHaveLength(2);
  });

  it('drops empty / non-string additionalImages entries', () => {
    const slides = buildSlides(artwork({ additionalImages: ['', '   ', null, undefined, 'https://x/real.jpg'] }));
    expect(slides).toHaveLength(2);
    expect(slides[1].full).toBe('https://x/real.jpg');
  });

  it('drops conservation photography (X-ray, IRR, UV, verso) but keeps detail crops', () => {
    const base = 'https://images.metmuseum.org/CRDImages/ep/original/';
    const slides = buildSlides(artwork({
      additionalImages: [`${base}DP-1-XRAY.jpg`, `${base}DP-1-IRR.jpg`, `${base}DP-1_det.jpg`, `${base}DP-1-verso.jpg`],
    }));
    expect(slides.map((s) => s.full)).toEqual(['https://x/full.jpg', `${base}DP-1_det.jpg`]);
  });

  it('tolerates a missing additionalImages field', () => {
    const { additionalImages, ...noImages } = artwork();
    void additionalImages;
    expect(buildSlides(noImages)).toHaveLength(1);
  });
});
