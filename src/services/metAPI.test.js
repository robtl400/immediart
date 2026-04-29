/**
 * metAPI.js unit tests
 *
 * Covers: validateArtwork, search(), fetchAllObjectIDs()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateArtwork } from './metAPI';

// ─── validateArtwork ──────────────────────────────────────────────────────────

describe('validateArtwork — strict: false (default, artist/tag searches)', () => {
  // Basic validation: image + title only — objectName is irrelevant
  it('returns true for a painting with all fields present', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Starry Night',
      objectName: 'Painting',
    })).toBe(true);
  });

  it('returns true for a non-painting (e.g. Drawing) — objectName not checked', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Self-Portrait',
      objectName: 'Drawing',
    })).toBe(true);
  });

  it('returns true for a Handscroll — objectName not checked', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'River Scene',
      objectName: 'Handscroll',
    })).toBe(true);
  });

  it('returns true when objectName is missing — objectName not checked', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'No Type',
    })).toBe(true);
  });

  // Core guards still apply
  it('returns false when primaryImage is missing', () => {
    expect(validateArtwork({
      primaryImage: '',
      title: 'No Image',
      objectName: 'Painting',
    })).toBe(false);
  });

  it('returns false when title is missing', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: '',
      objectName: 'Painting',
    })).toBe(false);
  });

  it('returns false for null/undefined artwork', () => {
    expect(validateArtwork(null)).toBe(false);
    expect(validateArtwork(undefined)).toBe(false);
  });
});

describe('validateArtwork — strict: true (feed/painting filter)', () => {
  // Happy path — painting-type objectNames pass
  it('returns true for a painting with all required fields', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Starry Night',
      objectName: 'Painting',
    }, { strict: true })).toBe(true);
  });

  it('returns true for "Painting, miniature" (startsWith still matches)', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Portrait',
      objectName: 'Painting, miniature',
    }, { strict: true })).toBe(true);
  });

  it('returns true for Watercolor', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Sargent Study',
      objectName: 'Watercolor',
    }, { strict: true })).toBe(true);
  });

  it('returns true for "Watercolor on paper" (startsWith still matches)', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Homer Seascape',
      objectName: 'Watercolor on paper',
    }, { strict: true })).toBe(true);
  });

  it('returns true for Fresco', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Roman Wall Fragment',
      objectName: 'Fresco',
    }, { strict: true })).toBe(true);
  });

  it('returns true for Mural', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Wall Painting',
      objectName: 'Mural',
    }, { strict: true })).toBe(true);
  });

  it('returns true for Portrait', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Portrait of a Woman',
      objectName: 'Portrait',
    }, { strict: true })).toBe(true);
  });

  it('returns true for Thangka', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'White Tara',
      objectName: 'Thangka',
    }, { strict: true })).toBe(true);
  });

  it('returns true for Kakemono', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Bamboo in Wind',
      objectName: 'Kakemono',
    }, { strict: true })).toBe(true);
  });

  it('returns true even when artistDisplayName is missing', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Untitled',
      objectName: 'Painting',
      artistDisplayName: '',
    }, { strict: true })).toBe(true);
  });

  it('returns true for "PAINTING" (uppercase — toLowerCase normalization)', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Landscape',
      objectName: 'PAINTING',
    }, { strict: true })).toBe(true);
  });

  // objectName filter — only applies with strict: true
  it('returns false for a Handscroll (not in OBJECT_TYPES allowlist)', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'River Scene',
      objectName: 'Handscroll',
    }, { strict: true })).toBe(false);
  });

  it('returns false for a Snuffbox (not in OBJECT_TYPES allowlist)', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'Decorated Box',
      objectName: 'Snuffbox',
    }, { strict: true })).toBe(false);
  });

  it('returns false when objectName is undefined', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'No Type',
    }, { strict: true })).toBe(false);
  });

  it('returns false when objectName is null', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: 'No Type',
      objectName: null,
    }, { strict: true })).toBe(false);
  });

  // Core guards still apply
  it('returns false when primaryImage is missing', () => {
    expect(validateArtwork({
      primaryImage: '',
      title: 'No Image',
      objectName: 'Painting',
    }, { strict: true })).toBe(false);
  });

  it('returns false when title is missing', () => {
    expect(validateArtwork({
      primaryImage: 'https://example.com/img.jpg',
      title: '',
      objectName: 'Painting',
    }, { strict: true })).toBe(false);
  });
});

// ─── search() ────────────────────────────────────────────────────────────────

import * as metAPI from './metAPI';

describe('search() — medium param', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits medium param when medium is null (default)', async () => {
    const { requestManager } = await import('./requestManager');
    await metAPI.search('test');
    const url = requestManager.fetch.mock.calls[0][0];
    expect(url).not.toContain('medium=');
    expect(url).toContain('hasImages=true');
  });

  it('includes medium=Paintings in URL when medium is specified', async () => {
    const { requestManager } = await import('./requestManager');
    await metAPI.search('painting', { medium: 'Paintings' });
    const url = requestManager.fetch.mock.calls[0][0];
    expect(url).toContain('medium=Paintings');
    expect(url).toContain('q=painting');
  });
});

// ─── fetchAllObjectIDs() ─────────────────────────────────────────────────────

import { getCachedIDs, setCachedIDs, getCachedArtwork } from './artworkCache';

vi.mock('./artworkCache', () => ({
  getCachedIDs: vi.fn(),
  setCachedIDs: vi.fn(),
  getCachedArtwork: vi.fn(),
  setCachedArtwork: vi.fn(),
}));

vi.mock('./requestManager', () => ({
  requestManager: {
    fetch: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ objectIDs: [10, 20, 30] }),
    }),
    fetchDeduped: vi.fn(),
    maxConcurrent: 6,
    batchCooldownMs: 150,
  },
}));

describe('fetchAllObjectIDs()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached IDs when cache key ids:feed:paintings-v2 hits', async () => {
    getCachedIDs.mockResolvedValue([1, 2, 3]);
    const { fetchAllObjectIDs } = await import('./metAPI');
    const result = await fetchAllObjectIDs();
    expect(getCachedIDs).toHaveBeenCalledWith('ids:feed:paintings-v2');
    expect(result).toEqual([1, 2, 3]);
    expect(setCachedIDs).not.toHaveBeenCalled();
  });

  it('never queries old cache key ids:feed:paintings', async () => {
    getCachedIDs.mockResolvedValue([1, 2, 3]);
    const { fetchAllObjectIDs } = await import('./metAPI');
    await fetchAllObjectIDs();
    const calls = getCachedIDs.mock.calls.map(c => c[0]);
    expect(calls).not.toContain('ids:feed:paintings');
  });

  it('caches with key ids:feed:paintings-v2 on cache miss', async () => {
    getCachedIDs.mockResolvedValue(null);
    const { fetchAllObjectIDs } = await import('./metAPI');
    await fetchAllObjectIDs();
    expect(setCachedIDs).toHaveBeenCalledWith('ids:feed:paintings-v2', expect.any(Array));
  });

  it('does not cache when API returns empty array', async () => {
    getCachedIDs.mockResolvedValue(null);
    // Make the requestManager return empty objectIDs
    const { requestManager } = await import('./requestManager');
    requestManager.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ objectIDs: [] }),
    });
    const { fetchAllObjectIDs } = await import('./metAPI');
    const result = await fetchAllObjectIDs();
    expect(result).toEqual([]);
    expect(setCachedIDs).not.toHaveBeenCalled();
  });
});

// ─── artist/tag search — objectName filter ───────────────────────────────────

describe('artist/tag search — fetchArtworkByID strict param', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedArtwork.mockResolvedValue(null);
  });

  it('strict: false (default) — returns Drawing for artist/tag searches', async () => {
    const { requestManager } = await import('./requestManager');
    requestManager.fetchDeduped.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        objectID: 99,
        title: 'Self-Portrait',
        primaryImage: 'https://example.com/drawing.jpg',
        objectName: 'Drawing',
      }),
    });
    const { fetchArtworkByID } = await import('./metAPI');
    const result = await fetchArtworkByID(99);
    expect(result).not.toBeNull();
    expect(result.objectID).toBe(99);
  });

  it('strict: true (feed) — returns null for a non-painting (e.g. objectName: Drawing)', async () => {
    const { requestManager } = await import('./requestManager');
    requestManager.fetchDeduped.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        objectID: 99,
        title: 'Self-Portrait',
        primaryImage: 'https://example.com/drawing.jpg',
        objectName: 'Drawing',
      }),
    });
    const { fetchArtworkByID } = await import('./metAPI');
    const result = await fetchArtworkByID(99, null, { strict: true });
    expect(result).toBeNull();
  });

  it('strict: true (feed) — returns artwork for a painting (objectName: Painting)', async () => {
    const { requestManager } = await import('./requestManager');
    requestManager.fetchDeduped.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        objectID: 100,
        title: 'Guernica',
        primaryImage: 'https://example.com/guernica.jpg',
        objectName: 'Painting',
      }),
    });
    const { fetchArtworkByID } = await import('./metAPI');
    const result = await fetchArtworkByID(100, null, { strict: true });
    expect(result).not.toBeNull();
    expect(result.objectID).toBe(100);
  });
});
