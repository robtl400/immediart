/**
 * transformers.js unit tests
 *
 * Covers: formatArtistUsername (T2-A), buildComments (T1-C), transformAPIToDisplay new fields.
 */

import { describe, it, expect } from 'vitest';
import { formatArtistUsername, buildComments, transformAPIToDisplay } from './transformers';

describe('formatArtistUsername (T2-A)', () => {
  it('formats plain name', () => {
    expect(formatArtistUsername('Vincent van Gogh')).toBe('@vincent_van_gogh');
  });

  it('removes parentheticals before lowercasing — no trailing underscore', () => {
    expect(formatArtistUsername('Vincent van Gogh (Dutch)')).toBe('@vincent_van_gogh');
  });

  it('handles global dash replace (Toulouse-Lautrec-Someone has all dashes replaced)', () => {
    expect(formatArtistUsername('Toulouse-Lautrec-Someone')).toBe('@toulouse_lautrec_someone');
  });

  it('all-parenthetical name returns Unknown_Artist', () => {
    expect(formatArtistUsername('(Unknown)')).toBe('@Unknown_Artist');
  });

  it('multiple parentheticals both removed', () => {
    expect(formatArtistUsername('Jan van Eyck (Flemish) (attr.)')).toBe('@jan_van_eyck');
  });

  it('null returns Unknown_Artist', () => {
    expect(formatArtistUsername(null)).toBe('@Unknown_Artist');
  });

  it('empty string returns Unknown_Artist', () => {
    expect(formatArtistUsername('')).toBe('@Unknown_Artist');
  });
});

describe('buildComments (T1-C)', () => {
  const makeArtwork = (overrides = {}) => ({
    department: 'European Paintings',
    GalleryNumber: null,
    creditLine: '',
    rightsAndReproduction: '',
    ...overrides,
  });

  it('returns empty array when no department', () => {
    expect(buildComments(makeArtwork({ department: '' }))).toEqual([]);
  });

  it('gallery works renders em dash format with gallery number', () => {
    const result = buildComments(makeArtwork({ GalleryNumber: '614' }));
    expect(result[0].text).toBe('From the European Paintings department — Gallery 614');
    expect(result[0].text).not.toContain('come visit us');
  });

  it('non-gallery always uses department-only text (creditLine no longer in comment)', () => {
    const result = buildComments(makeArtwork({ creditLine: 'Purchase, Mr. Fund, 1955' }));
    expect(result[0].text).toBe('From the European Paintings department.');
    expect(result[0].text).not.toContain('Purchase');
  });

  it('non-gallery without creditLine falls back to department only', () => {
    const result = buildComments(makeArtwork({ creditLine: '' }));
    expect(result[0].text).toBe('From the European Paintings department.');
  });

  it('comment username is @TheMetMuseum', () => {
    const result = buildComments(makeArtwork());
    expect(result[0].username).toBe('@TheMetMuseum');
  });
});

describe('transformAPIToDisplay — new social media fields', () => {
  const makeAPIArtwork = (overrides = {}) => ({
    objectID: 1,
    primaryImageSmall: 'https://example.com/img.jpg',
    artistDisplayName: 'Van Gogh',
    title: 'Starry Night',
    objectDate: '1889',
    department: 'European Paintings',
    GalleryNumber: null,
    creditLine: '',
    isHighlight: false,
    city: '',
    country: '',
    artistDisplayBio: '',
    artistULAN_URL: '',
    objectURL: '',
    accessionYear: '',
    additionalImages: [],
    constituents: [],
    ...overrides,
  });

  it('extracts artistBio from artistDisplayBio', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({ artistDisplayBio: 'Dutch, 1853–1890' }));
    expect(result.artistBio).toBe('Dutch, 1853–1890');
  });

  it('defaults artistBio to empty string when absent', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({ artistDisplayBio: undefined }));
    expect(result.artistBio).toBe('');
  });

  it('extracts objectURL', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({ objectURL: 'https://www.metmuseum.org/art/collection/search/1' }));
    expect(result.objectURL).toBe('https://www.metmuseum.org/art/collection/search/1');
  });

  it('defaults objectURL to empty string when absent', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({ objectURL: undefined }));
    expect(result.objectURL).toBe('');
  });

  it('extracts accessionYear', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({ accessionYear: '1955' }));
    expect(result.accessionYear).toBe('1955');
  });

  it('defaults additionalImages to empty array when absent', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({ additionalImages: undefined }));
    expect(result.additionalImages).toEqual([]);
  });

  it('preserves additionalImages array', () => {
    const imgs = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    const result = transformAPIToDisplay(makeAPIArtwork({ additionalImages: imgs }));
    expect(result.additionalImages).toEqual(imgs);
  });

  it('extracts artistULAN_URL', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({ artistULAN_URL: 'https://ulan.example.com/123' }));
    expect(result.artistULAN_URL).toBe('https://ulan.example.com/123');
  });
});
