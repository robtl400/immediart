/**
 * transformers.js unit tests
 *
 * Covers: formatArtistUsername (T2-A), buildComments (T1-C).
 */

import { describe, it, expect } from 'vitest';
import { formatArtistUsername, buildComments } from './transformers';

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

  it('non-gallery with creditLine uses em dash format and trims trailing space', () => {
    const result = buildComments(makeArtwork({ creditLine: 'Purchase, Mr. Fund, 1955' }));
    expect(result[0].text).toBe('From the European Paintings department — Purchase, Mr. Fund, 1955.');
    expect(result[0].text).not.toContain('©');
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
