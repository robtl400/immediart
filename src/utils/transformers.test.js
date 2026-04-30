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
    objectID: 0,
    department: 'European Paintings',
    artistDisplayBio: '',
    ...overrides,
  });

  it('returns empty array when no department and no bio', () => {
    expect(buildComments(makeArtwork({ department: '', artistDisplayBio: '' }))).toEqual([]);
  });

  it('dept-only: cycles through 3 variants by objectID', () => {
    expect(buildComments(makeArtwork({ objectID: 0 }))[0].text).toBe('From the European Paintings department.');
    expect(buildComments(makeArtwork({ objectID: 1 }))[0].text).toBe('Part of the European Paintings collection.');
    expect(buildComments(makeArtwork({ objectID: 2 }))[0].text).toBe('A work from the European Paintings collection.');
    // variant wraps back to 0
    expect(buildComments(makeArtwork({ objectID: 3 }))[0].text).toBe('From the European Paintings department.');
  });

  it('dept+bio: cycles through 4 variants by objectID', () => {
    const bio = 'Dutch, 1853–1890';
    expect(buildComments(makeArtwork({ objectID: 0, artistDisplayBio: bio }))[0].text)
      .toBe('From our European Paintings collection. Dutch, 1853–1890.');
    expect(buildComments(makeArtwork({ objectID: 1, artistDisplayBio: bio }))[0].text)
      .toBe('Dutch, 1853–1890 — part of the European Paintings collection.');
    expect(buildComments(makeArtwork({ objectID: 2, artistDisplayBio: bio }))[0].text)
      .toBe('Dutch, 1853–1890. A work from the European Paintings department.');
    expect(buildComments(makeArtwork({ objectID: 3, artistDisplayBio: bio }))[0].text)
      .toBe('Part of the European Paintings collection. Dutch, 1853–1890.');
  });

  it('bio-only (no dept): uses bio text as comment', () => {
    const result = buildComments(makeArtwork({ department: '', artistDisplayBio: 'Dutch, 1853–1890' }));
    expect(result[0].text).toBe('Dutch, 1853–1890.');
  });

  it('creditLine is never included in comment text', () => {
    const result = buildComments(makeArtwork({ artistDisplayBio: 'Dutch, 1853–1890' }));
    expect(result[0].text).not.toContain('Purchase');
  });

  it('comment username is @TheMetMuseum', () => {
    expect(buildComments(makeArtwork())[0].username).toBe('@TheMetMuseum');
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
