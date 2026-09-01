/**
 * transformers.js unit tests
 *
 * Covers: formatArtistUsername (T2-A), buildComments (T1-C), transformAPIToDisplay new fields.
 */

import { describe, it, expect } from 'vitest';
import { formatArtistUsername, buildComments, transformAPIToDisplay, artworkCaption } from './transformers';

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

  it('all-parenthetical name returns @unknown_artist', () => {
    expect(formatArtistUsername('(Unknown)')).toBe('@unknown_artist');
  });

  it('multiple parentheticals both removed', () => {
    expect(formatArtistUsername('Jan van Eyck (Flemish) (attr.)')).toBe('@jan_van_eyck');
  });

  it('null returns @unknown_artist', () => {
    expect(formatArtistUsername(null)).toBe('@unknown_artist');
  });

  it('empty string returns @unknown_artist', () => {
    expect(formatArtistUsername('')).toBe('@unknown_artist');
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
  additionalImages: [],
  constituents: [],
  ...overrides,
});

describe('transformAPIToDisplay — new social media fields', () => {

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

describe('transformAPIToDisplay — frameAspect seeded from catalogued dimensions', () => {
  it('derives a clamped aspect from the first measurement with a height and a width', () => {
    const result = transformAPIToDisplay(makeAPIArtwork({
      measurements: [
        { elementName: 'Frame', elementMeasurements: { Depth: 5 } },              // no width/height — skipped
        { elementName: 'Overall', elementMeasurements: { Height: 100, Width: 50 } },
      ],
    }));
    expect(result.frameAspect).toBe(0.8); // 50/100 = 0.5, clamped up to the 4:5 tall cap
  });

  it('is null when the catalogue has no usable size (keeps the square placeholder)', () => {
    expect(transformAPIToDisplay(makeAPIArtwork({ measurements: [] })).frameAspect).toBeNull();
    expect(transformAPIToDisplay(makeAPIArtwork({})).frameAspect).toBeNull();
  });

  it('ignores three-dimensional measurements — a footprint says nothing about the photograph', () => {
    const vase = transformAPIToDisplay(makeAPIArtwork({
      measurements: [{ elementName: 'Overall', elementMeasurements: { Height: 30, Width: 15, Depth: 15 } }],
    }));
    expect(vase.frameAspect).toBeNull();
  });
});

describe('artworkCaption', () => {
  it('names the artist when there is one', () => {
    expect(artworkCaption({ title: 'The Garter', artistName: 'Jean François de Troy' })).toBe('The Garter by Jean François de Troy');
  });
  it('is just the title for anonymous works — never "Title by "', () => {
    expect(artworkCaption({ title: 'Portrait of a Man', artistName: '' })).toBe('Portrait of a Man');
  });
});
