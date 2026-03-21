/**
 * metAPI.js unit tests
 *
 * Covers: validateArtwork (relaxed — Phase 2 regression tests).
 */

import { describe, it, expect } from 'vitest';
import { validateArtwork } from './metAPI';

describe('validateArtwork — relaxed validation (Phase 2)', () => {
  it('returns true when primaryImage and title are present', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Starry Night',
    })).toBe(true);
  });

  it('returns true even when artistDisplayName is missing', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Untitled',
      artistDisplayName: '',
    })).toBe(true);
  });

  it('returns true even when isPublicDomain is false', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Modern Work',
      isPublicDomain: false,
    })).toBe(true);
  });

  it('returns false when primaryImage is missing', () => {
    expect(validateArtwork({
      primaryImage: '',
      title: 'No Image',
    })).toBe(false);
  });

  it('returns false when title is missing', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: '',
    })).toBe(false);
  });

  it('returns false for null/undefined artwork', () => {
    expect(validateArtwork(null)).toBe(false);
    expect(validateArtwork(undefined)).toBe(false);
  });
});
