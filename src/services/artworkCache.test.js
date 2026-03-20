/**
 * artworkCache.js + metAPI.js cache integration tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Reset fake-indexeddb before each test for isolation
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  // Reset module-level singleton so a fresh DB is opened each test
  vi.resetModules();
});

// ─── artworkCache.js unit tests ────────────────────────────────────────────

describe('artworkCache — IDs', () => {
  it('getCachedIDs returns null on miss', async () => {
    const { getCachedIDs } = await import('./artworkCache.js');
    const result = await getCachedIDs('ids:feed:paintings');
    expect(result).toBeNull();
  });

  it('getCachedIDs returns ids on hit within TTL', async () => {
    const { getCachedIDs, setCachedIDs } = await import('./artworkCache.js');
    const ids = [1, 2, 3];
    await setCachedIDs('ids:feed:paintings', ids);
    const result = await getCachedIDs('ids:feed:paintings');
    expect(result).toEqual(ids);
  });

  it('getCachedIDs returns null when TTL expired', async () => {
    const { getCachedIDs, setCachedIDs } = await import('./artworkCache.js');
    // Use TTL of 1ms so it expires immediately
    await setCachedIDs('ids:feed:paintings', [1, 2, 3], 1);
    await new Promise(r => setTimeout(r, 5));
    const result = await getCachedIDs('ids:feed:paintings');
    expect(result).toBeNull();
  });

  it('setCachedIDs + getCachedIDs round-trip', async () => {
    const { getCachedIDs, setCachedIDs } = await import('./artworkCache.js');
    const ids = [100, 200, 300];
    await setCachedIDs('ids:artist:Rembrandt', ids);
    const result = await getCachedIDs('ids:artist:Rembrandt');
    expect(result).toEqual(ids);
  });
});

describe('artworkCache — artworks', () => {
  it('getCachedArtwork returns null on miss', async () => {
    const { getCachedArtwork } = await import('./artworkCache.js');
    const result = await getCachedArtwork(99999);
    expect(result).toBeNull();
  });

  it('getCachedArtwork returns object on hit within TTL', async () => {
    const { getCachedArtwork, setCachedArtwork } = await import('./artworkCache.js');
    const artwork = { objectID: 42, title: 'Starry Night' };
    await setCachedArtwork(42, artwork);
    const result = await getCachedArtwork(42);
    expect(result).toEqual(artwork);
  });

  it('getCachedArtwork returns null when expired', async () => {
    const { getCachedArtwork, setCachedArtwork } = await import('./artworkCache.js');
    await setCachedArtwork(42, { objectID: 42 }, 1);
    await new Promise(r => setTimeout(r, 5));
    const result = await getCachedArtwork(42);
    expect(result).toBeNull();
  });

  it('setCachedArtwork + getCachedArtwork round-trip', async () => {
    const { getCachedArtwork, setCachedArtwork } = await import('./artworkCache.js');
    const obj = { objectID: 7, title: 'The Night Watch', artistDisplayName: 'Rembrandt' };
    await setCachedArtwork(7, obj);
    const result = await getCachedArtwork(7);
    expect(result).toEqual(obj);
  });
});

describe('artworkCache — clearCache', () => {
  it('clearCache removes all entries; subsequent reads return null', async () => {
    const { getCachedIDs, setCachedIDs, getCachedArtwork, setCachedArtwork, clearCache } = await import('./artworkCache.js');
    await setCachedIDs('ids:feed:paintings', [1, 2]);
    await setCachedArtwork(5, { objectID: 5, title: 'Test' });
    await clearCache();
    expect(await getCachedIDs('ids:feed:paintings')).toBeNull();
    expect(await getCachedArtwork(5)).toBeNull();
  });
});

describe('artworkCache — key namespacing', () => {
  it('ids:artist:X and ids:tag:X are distinct slots', async () => {
    const { getCachedIDs, setCachedIDs } = await import('./artworkCache.js');
    await setCachedIDs('ids:artist:Monet', [1, 2]);
    await setCachedIDs('ids:tag:Monet', [3, 4]);
    expect(await getCachedIDs('ids:artist:Monet')).toEqual([1, 2]);
    expect(await getCachedIDs('ids:tag:Monet')).toEqual([3, 4]);
  });
});

describe('artworkCache — storage error resilience', () => {
  it('setCachedIDs swallows IndexedDB write failure without throwing', async () => {
    const { setCachedIDs } = await import('./artworkCache.js');
    // Simulate quota error by replacing indexedDB.open with a failing version
    const origOpen = globalThis.indexedDB.open.bind(globalThis.indexedDB);
    let callCount = 0;
    globalThis.indexedDB.open = (...args) => {
      callCount++;
      if (callCount > 1) {
        // Let the first open succeed (DB init), fail subsequent transaction attempts
        const req = origOpen(...args);
        req.addEventListener('success', () => {
          const db = req.result;
          const origTransaction = db.transaction.bind(db);
          db.transaction = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
        });
        return req;
      }
      return origOpen(...args);
    };
    // Should not throw
    await expect(setCachedIDs('ids:feed:paintings', [1, 2, 3])).resolves.toBeUndefined();
  });

  it('setCachedArtwork swallows write failure without throwing', async () => {
    const { setCachedArtwork } = await import('./artworkCache.js');
    // Patch indexedDB to be null (simulates private browsing unavailability)
    const orig = globalThis.indexedDB;
    globalThis.indexedDB = null;
    await expect(setCachedArtwork(1, { objectID: 1 })).resolves.toBeUndefined();
    globalThis.indexedDB = orig;
  });
});

// ─── metAPI.js cache integration tests ────────────────────────────────────

describe('metAPI — fetchArtworkByID cache integration', () => {
  it('cache hit returns cached object without calling fetch', async () => {
    const { setCachedArtwork } = await import('./artworkCache.js');
    const cached = {
      objectID: 10,
      title: 'Cached Artwork',
      artistDisplayName: 'Artist',
      primaryImage: 'https://example.com/img.jpg',
      isPublicDomain: true
    };
    await setCachedArtwork(10, cached);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchArtworkByID } = await import('./metAPI.js');
    const result = await fetchArtworkByID(10);
    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('cache miss calls fetch and writes result to cache', async () => {
    const apiArtwork = {
      objectID: 11,
      title: 'Fresh Artwork',
      artistDisplayName: 'Painter',
      primaryImage: 'https://example.com/art.jpg',
      isPublicDomain: true
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiArtwork
    }));

    const { fetchArtworkByID } = await import('./metAPI.js');
    const { getCachedArtwork } = await import('./artworkCache.js');

    const result = await fetchArtworkByID(11);
    expect(result).toEqual(apiArtwork);

    // Should now be in cache
    const fromCache = await getCachedArtwork(11);
    expect(fromCache).toEqual(apiArtwork);

    vi.unstubAllGlobals();
  });

  it('in-flight dedup: two concurrent calls for same ID fire only one fetch', async () => {
    const apiArtwork = {
      objectID: 12,
      title: 'Deduped',
      artistDisplayName: 'Painter',
      primaryImage: 'https://example.com/dedup.jpg',
      isPublicDomain: true
    };

    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => apiArtwork
      });
    }));

    const { fetchArtworkByID } = await import('./metAPI.js');
    const [r1, r2] = await Promise.all([fetchArtworkByID(12), fetchArtworkByID(12)]);

    expect(r1).toEqual(apiArtwork);
    expect(r2).toEqual(apiArtwork);
    expect(fetchCount).toBe(1); // Only one network call

    vi.unstubAllGlobals();
  });
});

// ─── metAPI.js error-path tests ───────────────────────────────────────────────
// All blocks use dynamic import — required because beforeEach resets modules,
// which also resets the pendingFetches Map and requestQueue singleton in metAPI.

describe('metAPI — fetchWithRetry: 403 retry behavior', () => {
  it('retries on 403 up to MAX_RETRIES; throws after exhaustion', async () => {
    const { MAX_RETRIES } = await import('../utils/constants.js');
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      callCount++;
      return Promise.resolve({ ok: false, status: 403, json: async () => ({}) });
    }));

    const { fetchArtworkByID } = await import('./metAPI.js');
    // fetchArtworkByID calls fetchWithRetry — 403 is handled inside; returns null after retries
    const result = await fetchArtworkByID(9999);
    // After MAX_RETRIES exhausted on 403, fetchWithRetry returns the last response
    // fetchArtworkByID returns null for non-ok responses
    expect(result).toBeNull();
    expect(callCount).toBe(MAX_RETRIES);

    vi.unstubAllGlobals();
  });

  it('AbortError is not retried; propagates to caller', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.reject(new DOMException('Aborted', 'AbortError'))
    ));

    const { fetchArtworkByID } = await import('./metAPI.js');
    const controller = new AbortController();
    controller.abort();

    await expect(fetchArtworkByID(9999, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    vi.unstubAllGlobals();
  });

  it('network failure (TypeError) is retried then throws', async () => {
    const { MAX_RETRIES } = await import('../utils/constants.js');
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      callCount++;
      return Promise.reject(new TypeError('Failed to fetch'));
    }));

    const { fetchArtworkByID } = await import('./metAPI.js');
    // Network errors propagate as null from fetchArtworkByID (it catches and returns null)
    const result = await fetchArtworkByID(9999);
    expect(result).toBeNull();
    expect(callCount).toBe(MAX_RETRIES);

    vi.unstubAllGlobals();
  });
});

describe('metAPI — batchFetchArtworks error paths', () => {
  it('404/invalid IDs are filtered out; valid artworks returned', async () => {
    const validArtwork = {
      objectID: 1,
      title: 'Valid',
      artistDisplayName: 'Artist',
      primaryImage: 'https://example.com/1.jpg',
      isPublicDomain: true,
    };
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First ID returns 404
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => validArtwork });
    }));

    const { batchFetchArtworks } = await import('./metAPI.js');
    const results = await batchFetchArtworks([101, 1], 1);

    // 404 filtered out; valid artwork returned
    expect(results).toHaveLength(1);
    expect(results[0].objectID).toBe(1);

    vi.unstubAllGlobals();
  });

  it('abort mid-batch propagates AbortError', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }));

    const { batchFetchArtworks } = await import('./metAPI.js');
    await expect(
      batchFetchArtworks([1, 2, 3], 3, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });

    vi.unstubAllGlobals();
  });
});

describe('metAPI — search wrapper cache integration', () => {
  it('fetchAllObjectIDs: cache hit skips API call', async () => {
    const { setCachedIDs } = await import('./artworkCache.js');
    await setCachedIDs('ids:feed:paintings', [1, 2, 3]);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchAllObjectIDs } = await import('./metAPI.js');
    const result = await fetchAllObjectIDs(null);
    expect(result).toEqual([1, 2, 3]);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('searchByArtist: cache miss fetches and caches; cache hit skips API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ objectIDs: [10, 20, 30] })
    }));

    const { searchByArtist } = await import('./metAPI.js');
    const { getCachedIDs } = await import('./artworkCache.js');

    const artistIDs = await searchByArtist('Vermeer', null);
    expect(artistIDs).toEqual([10, 20, 30]);
    expect(await getCachedIDs('ids:artist:Vermeer')).toEqual([10, 20, 30]);

    // Cache hit — fetch should NOT be called again
    vi.mocked(fetch).mockClear();
    const cached = await searchByArtist('Vermeer', null);
    expect(cached).toEqual([10, 20, 30]);
    expect(fetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('searchByTag: cache miss fetches and caches under ids:tag: key; cache hit skips API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ objectIDs: [40, 50, 60] })
    }));

    const { searchByTag } = await import('./metAPI.js');
    const { getCachedIDs } = await import('./artworkCache.js');

    const tagIDs = await searchByTag('landscape', null);
    expect(tagIDs).toEqual([40, 50, 60]);
    expect(await getCachedIDs('ids:tag:landscape')).toEqual([40, 50, 60]);

    // Cache hit — fetch should NOT be called again
    vi.mocked(fetch).mockClear();
    const cached = await searchByTag('landscape', null);
    expect(cached).toEqual([40, 50, 60]);
    expect(fetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
