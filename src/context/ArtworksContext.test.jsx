/**
 * ArtworksContext tests
 *
 * Covers: initial load (cache hit/miss), loadMoreArtworks guard logic,
 * prefetch merge, and MAX_ARTWORKS_IN_MEMORY trim.
 *
 * Pattern:
 *   vi.useFakeTimers() in every beforeEach — drains via vi.runAllTimersAsync()
 *   Default mock: cache hit (getCachedIDs → ALL_IDS) to avoid real delays.
 *   startPrefetch fires after initial load; mocks account for 2+ calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ArtworksProvider, useArtworks } from './ArtworksContext';
import { FEED_BATCH_SIZE, MAX_ARTWORKS_IN_MEMORY } from '../utils/constants';

vi.mock('../services/metAPI', () => ({
  fetchAllObjectIDs: vi.fn(),
  batchFetchArtworks: vi.fn(),
  shuffleArray: (arr) => arr, // identity — deterministic ordering
}));

vi.mock('../services/artworkCache', () => ({
  getCachedIDs: vi.fn(),
  setCachedIDs: vi.fn(),
  getCachedArtwork: vi.fn().mockResolvedValue(null),
  clearCache: vi.fn(),
}));

import { fetchAllObjectIDs, batchFetchArtworks } from '../services/metAPI';
import { getCachedIDs } from '../services/artworkCache';

// ─── helpers ──────────────────────────────────────────────────────────────────

const ALL_IDS = Array.from({ length: 100 }, (_, i) => i + 1);

const makeRawArtwork = (id) => ({
  objectID: id,
  title: `Art ${id}`,
  artistDisplayName: `Artist ${id}`,
  primaryImage: `https://example.com/${id}.jpg`,
  primaryImageSmall: `https://example.com/${id}-sm.jpg`,
  isPublicDomain: true,
  medium: '',
  culture: '',
  period: '',
  tags: [],
  department: '',
  objectDate: '',
});

const makeBatch = (count, startId = 1) =>
  Array.from({ length: count }, (_, i) => makeRawArtwork(startId + i));

/** Drain all pending timers and promises. */
const drain = () => act(async () => { await vi.runAllTimersAsync(); });

const wrapper = ({ children }) => <ArtworksProvider>{children}</ArtworksProvider>;

// ─── initial load ─────────────────────────────────────────────────────────────

describe('ArtworksContext — initial load', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchAllObjectIDs.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(FEED_BATCH_SIZE));
    getCachedIDs.mockResolvedValue(ALL_IDS); // default: cache hit, no delay
  });

  afterEach(() => vi.useRealTimers());

  it('fetches IDs and first batch on mount; loading goes false after', async () => {
    const { result } = renderHook(() => useArtworks(), { wrapper });
    expect(result.current.loading).toBe(true);

    await drain();

    expect(result.current.loading).toBe(false);
    expect(result.current.artworks).toHaveLength(FEED_BATCH_SIZE);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('cache miss: 300ms delay fires before batchFetchArtworks', async () => {
    // Override: cache miss so the 300ms delay path runs
    getCachedIDs.mockResolvedValue(null);
    fetchAllObjectIDs.mockResolvedValue(ALL_IDS);

    let resolveBatch;
    batchFetchArtworks.mockReturnValue(
      new Promise((res) => { resolveBatch = res; })
    );

    renderHook(() => useArtworks(), { wrapper });

    // Drain microtasks so fetchAllObjectIDs resolves, but don't advance timers yet
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // batchFetchArtworks should NOT be called yet — waiting on 300ms delay
    expect(batchFetchArtworks).not.toHaveBeenCalled();

    // Advance timers past the 300ms delay
    resolveBatch(makeBatch(FEED_BATCH_SIZE));
    await act(async () => { await vi.runAllTimersAsync(); });

    // Now it should have been called
    expect(batchFetchArtworks).toHaveBeenCalled();
  });

  it('cache hit: batchFetchArtworks called immediately (no delay)', async () => {
    getCachedIDs.mockResolvedValue(ALL_IDS);
    const { result } = renderHook(() => useArtworks(), { wrapper });

    await drain();

    expect(batchFetchArtworks).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.artworks.length).toBeGreaterThan(0);
  });

  it('API error sets error state; loading goes false', async () => {
    getCachedIDs.mockResolvedValue(null);
    fetchAllObjectIDs.mockRejectedValue(new Error('network failure'));

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('network failure');
    expect(result.current.artworks).toHaveLength(0);
  });
});

// ─── loadMoreArtworks guard logic ─────────────────────────────────────────────

describe('ArtworksContext — loadMoreArtworks guard logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCachedIDs.mockResolvedValue(ALL_IDS); // cache hit — no delays
    fetchAllObjectIDs.mockResolvedValue(ALL_IDS);
  });

  afterEach(() => vi.useRealTimers());

  it('does nothing when hasMore is false', async () => {
    // Empty ID list → hasMore goes false after initial load
    getCachedIDs.mockResolvedValue([]);
    batchFetchArtworks.mockResolvedValue([]);

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain();

    expect(result.current.hasMore).toBe(false);
    const callsBefore = batchFetchArtworks.mock.calls.length;

    await act(async () => { result.current.loadMoreArtworks(); });
    expect(batchFetchArtworks).toHaveBeenCalledTimes(callsBefore);
  });

  it('does nothing when fetchingRef is true (concurrent call guard)', async () => {
    // Initial load resolves; ALL subsequent calls (startPrefetch + loadMore) hang
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE)) // call 1: initial load
      .mockReturnValue(new Promise(() => {}));            // all others: hang forever

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain(); // initial load completes; startPrefetch starts (hanging)

    // loadMoreArtworks: no prefetch data → calls fetchArtworks → fetchingRef=true
    await act(async () => {
      result.current.loadMoreArtworks();
      await Promise.resolve();
    });

    expect(result.current.loadingMore).toBe(true); // fetchArtworks is in-flight
    const callsBefore = batchFetchArtworks.mock.calls.length;

    // Second call — blocked by fetchingRef=true
    await act(async () => { result.current.loadMoreArtworks(); });
    expect(batchFetchArtworks).toHaveBeenCalledTimes(callsBefore);
  });

  it('does nothing when loadingMore is true', async () => {
    // Initial load resolves; ALL subsequent calls hang so loadingMore stays true
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE)) // initial
      .mockReturnValue(new Promise(() => {}));            // startPrefetch + first loadMore

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain(); // initial load done; startPrefetch hanging; prefetchRef=null

    // Start first loadMoreArtworks → calls fetchArtworks → setLoadingMore(true)
    await act(async () => {
      result.current.loadMoreArtworks();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loadingMore).toBe(true);
    const callsBefore = batchFetchArtworks.mock.calls.length;

    // Second call — blocked by loadingMore=true
    await act(async () => { result.current.loadMoreArtworks(); });
    expect(batchFetchArtworks).toHaveBeenCalledTimes(callsBefore);
  });
});

// ─── prefetch merge ───────────────────────────────────────────────────────────

describe('ArtworksContext — prefetch merge', () => {
  // startPrefetch fires after initial load (call 2).
  // loadMoreArtworks merge is instant → triggers startPrefetch again (call 3).
  // Assertions: artworks grew, no loading state, hasMore correct.

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCachedIDs.mockResolvedValue(ALL_IDS);
  });

  afterEach(() => vi.useRealTimers());

  it('uses prefetched data: loadMoreArtworks merges instantly without entering loading state', async () => {
    batchFetchArtworks.mockResolvedValue(makeBatch(FEED_BATCH_SIZE));

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain();
    // Give startPrefetch time to resolve and populate prefetchRef
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const beforeLen = result.current.artworks.length;

    await act(async () => { result.current.loadMoreArtworks(); });

    // Artworks grew — merge consumed the prefetch data
    expect(result.current.artworks.length).toBeGreaterThan(beforeLen);
    // No loading state — merge was synchronous/instant
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('merged artworks are appended to state', async () => {
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE, 1))    // initial
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE, 100))  // prefetch #1
      .mockResolvedValue(makeBatch(FEED_BATCH_SIZE, 200));     // prefetch #2+

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const beforeLen = result.current.artworks.length;
    await act(async () => { result.current.loadMoreArtworks(); });

    expect(result.current.artworks.length).toBeGreaterThan(beforeLen);
  });

  it('hasMore updates correctly after prefetch merge based on nextIndex', async () => {
    // Small ID list: FEED_BATCH_SIZE * 2 total IDs
    const smallIDs = Array.from({ length: FEED_BATCH_SIZE * 2 }, (_, i) => i + 1);
    getCachedIDs.mockResolvedValue(smallIDs);

    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE, 1))
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE, 100));

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => { result.current.loadMoreArtworks(); });

    // nextIndex after merge >= smallIDs.length → hasMore=false
    expect(result.current.hasMore).toBe(false);
  });

  it('startPrefetch is triggered again after merge', async () => {
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE, 1))    // initial
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE, 100))  // prefetch #1
      .mockResolvedValueOnce(makeBatch(FEED_BATCH_SIZE, 200)); // prefetch #2 (after merge)

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain();
    // Allow prefetch #1 to settle
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(batchFetchArtworks).toHaveBeenCalledTimes(2); // initial + prefetch #1

    await act(async () => { result.current.loadMoreArtworks(); });
    // Allow prefetch #2 to start
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // prefetch #2 triggered after merge
    expect(batchFetchArtworks).toHaveBeenCalledTimes(3);
  });
});

// ─── MAX_ARTWORKS_IN_MEMORY trim ──────────────────────────────────────────────

describe('ArtworksContext — MAX_ARTWORKS_IN_MEMORY trim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCachedIDs.mockResolvedValue(ALL_IDS);
  });

  afterEach(() => vi.useRealTimers());

  it('combined list exceeding MAX trims to last MAX_ARTWORKS_IN_MEMORY entries', async () => {
    batchFetchArtworks.mockResolvedValue(makeBatch(FEED_BATCH_SIZE));

    const { result } = renderHook(() => useArtworks(), { wrapper });
    await drain();

    // Load enough batches to exceed MAX_ARTWORKS_IN_MEMORY (30)
    // Each loadMoreArtworks (non-prefetch path) adds FEED_BATCH_SIZE artworks.
    // After initial (4), need ~7 more loadMores → 32 > 30 → trim kicks in.
    const iterations = Math.ceil(MAX_ARTWORKS_IN_MEMORY / FEED_BATCH_SIZE) + 2;
    for (let i = 0; i < iterations; i++) {
      await act(async () => { result.current.loadMoreArtworks(); });
      await drain();
    }

    expect(result.current.artworks.length).toBeLessThanOrEqual(MAX_ARTWORKS_IN_MEMORY);
  });
});
