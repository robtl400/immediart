/**
 * GridBrowseContext tests
 *
 * Covers: initSearch (cache hit/miss, artist/tag dispatch, empty results),
 * loadMore guard logic, prefetch merge, and abort behavior.
 *
 * Pattern:
 *   vi.useFakeTimers() in every beforeEach — drains via vi.runAllTimersAsync()
 *   Default mock: getCachedIDs → ALL_IDS (cache hit) to avoid real delays.
 *   Tests that need cache miss override getCachedIDs.mockResolvedValue(null).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { GridBrowseProvider, useGridBrowse } from './GridBrowseContext';
import { GRID_BATCH_SIZE } from '../utils/constants';

vi.mock('../services/metAPI', () => ({
  searchByArtist: vi.fn(),
  searchByTag: vi.fn(),
  batchFetchArtworks: vi.fn(),
}));

vi.mock('../services/artworkCache', () => ({
  getCachedIDs: vi.fn(),
  setCachedIDs: vi.fn(),
}));

vi.mock('../utils/imageLoader', () => ({
  preloadArtworkImages: vi.fn(),
}));

import { searchByArtist, searchByTag, batchFetchArtworks } from '../services/metAPI';
import { getCachedIDs } from '../services/artworkCache';

// ─── helpers ──────────────────────────────────────────────────────────────────

const ALL_IDS = Array.from({ length: 50 }, (_, i) => i + 1);

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

const wrapper = ({ children }) => <GridBrowseProvider>{children}</GridBrowseProvider>;

// ─── initSearch ───────────────────────────────────────────────────────────────

describe('GridBrowseContext — initSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCachedIDs.mockResolvedValue(ALL_IDS); // default: cache hit, no delays
    searchByArtist.mockResolvedValue(ALL_IDS);
    searchByTag.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(GRID_BATCH_SIZE));
  });

  afterEach(() => vi.useRealTimers());

  it('sets loading true then false after settling; artworks populated', async () => {
    const { result } = renderHook(() => useGridBrowse(), { wrapper });

    act(() => { result.current.initSearch('artist', 'Rembrandt'); });

    await drain();

    expect(result.current.loading).toBe(false);
    expect(result.current.artworks.length).toBeGreaterThan(0);
  });

  it('cache hit: batchFetchArtworks called without delay; no search API call', async () => {
    getCachedIDs.mockResolvedValue(ALL_IDS);
    const { result } = renderHook(() => useGridBrowse(), { wrapper });

    act(() => { result.current.initSearch('artist', 'Vermeer'); });
    await drain();

    expect(batchFetchArtworks).toHaveBeenCalled();
    expect(searchByArtist).not.toHaveBeenCalled(); // cache hit skips API
    expect(result.current.loading).toBe(false);
  });

  it('cache miss: NAVIGATION_DELAY_MS fires before search API call', async () => {
    getCachedIDs.mockResolvedValue(null); // cache miss → delays fire

    let resolveSearch;
    searchByArtist.mockReturnValue(
      new Promise((res) => { resolveSearch = res; })
    );

    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('artist', 'Monet'); });

    // Before timers advance: searchByArtist should not be called yet
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(searchByArtist).not.toHaveBeenCalled();

    // Advance timers past NAVIGATION_DELAY_MS + SEARCH_COOLDOWN_MS
    resolveSearch(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(GRID_BATCH_SIZE));
    await drain();

    expect(searchByArtist).toHaveBeenCalled();
  });

  it('type=artist: searchByArtist called; searchByTag not called', async () => {
    // Cache miss required so the search function is actually invoked
    getCachedIDs.mockResolvedValue(null);
    searchByArtist.mockResolvedValue(ALL_IDS);

    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('artist', 'Vermeer'); });
    await drain();

    expect(searchByArtist).toHaveBeenCalledWith('Vermeer', expect.anything());
    expect(searchByTag).not.toHaveBeenCalled();
  });

  it('type=tag: searchByTag called; searchByArtist not called', async () => {
    getCachedIDs.mockResolvedValue(null);
    searchByTag.mockResolvedValue(ALL_IDS);

    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('tag', 'landscape'); });
    await drain();

    expect(searchByTag).toHaveBeenCalledWith('landscape', expect.anything());
    expect(searchByArtist).not.toHaveBeenCalled();
  });

  it('empty results: hasMore=false, batchFetchArtworks not called', async () => {
    getCachedIDs.mockResolvedValue([]); // empty ID list

    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('artist', 'Unknown'); });
    await drain();

    expect(result.current.hasMore).toBe(false);
    expect(batchFetchArtworks).not.toHaveBeenCalled();
  });
});

// ─── loadMore guard logic ─────────────────────────────────────────────────────

describe('GridBrowseContext — loadMore guard logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCachedIDs.mockResolvedValue(ALL_IDS);
    searchByArtist.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(GRID_BATCH_SIZE));
  });

  afterEach(() => vi.useRealTimers());

  /** Run initSearch and wait for everything to settle. */
  async function setup() {
    const hook = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { hook.result.current.initSearch('artist', 'Vermeer'); });
    await drain();
    return hook;
  }

  it('does nothing when hasMore is false', async () => {
    getCachedIDs.mockResolvedValue([]);
    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('artist', 'X'); });
    await drain();

    expect(result.current.hasMore).toBe(false);
    const callsBefore = batchFetchArtworks.mock.calls.length;

    await act(async () => { result.current.loadMore(); });
    expect(batchFetchArtworks).toHaveBeenCalledTimes(callsBefore);
  });

  it('does nothing when fetchingRef is true', async () => {
    // initSearch batch resolves; ALL subsequent calls (startPrefetch + loadMore) hang
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(GRID_BATCH_SIZE)) // initSearch
      .mockReturnValue(new Promise(() => {}));            // startPrefetch + loadMore hang

    const hook = await setup();
    // After setup: initSearch done, startPrefetch hanging (prefetchRef=null)

    // First loadMore: no prefetch → goes through batchFetchArtworks path → fetchingRef=true
    await act(async () => {
      hook.result.current.loadMore();
      await Promise.resolve();
    });

    expect(hook.result.current.loadingMore).toBe(true);
    const callsBefore = batchFetchArtworks.mock.calls.length;

    // Second loadMore — fetchingRef=true blocks it
    await act(async () => { hook.result.current.loadMore(); });
    expect(batchFetchArtworks).toHaveBeenCalledTimes(callsBefore);
  });

  it('does nothing when loadingMore is true', async () => {
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(GRID_BATCH_SIZE)) // initSearch
      .mockReturnValue(new Promise(() => {}));            // startPrefetch + first loadMore hang

    const hook = await setup();

    // First loadMore: hanging → sets loadingMore=true
    await act(async () => {
      hook.result.current.loadMore();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current.loadingMore).toBe(true);
    const callsBefore = batchFetchArtworks.mock.calls.length;

    // Second loadMore — loadingMore=true blocks it
    await act(async () => { hook.result.current.loadMore(); });
    expect(batchFetchArtworks).toHaveBeenCalledTimes(callsBefore);
  });
});

// ─── prefetch merge ───────────────────────────────────────────────────────────

describe('GridBrowseContext — prefetch merge', () => {
  // startPrefetch fires after initSearch (call 2).
  // loadMore merge is instant → startPrefetch again (call 3).
  // Assertions: artworks grew, loadingMore stays false.

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCachedIDs.mockResolvedValue(ALL_IDS);
    searchByArtist.mockResolvedValue(ALL_IDS);
  });

  afterEach(() => vi.useRealTimers());

  it('loadMore merges instantly without entering loading state', async () => {
    batchFetchArtworks.mockResolvedValue(makeBatch(GRID_BATCH_SIZE));

    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('artist', 'Rembrandt'); });
    await drain();
    // Allow startPrefetch to resolve and populate prefetchRef
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const beforeLen = result.current.artworks.length;

    await act(async () => { result.current.loadMore(); });

    expect(result.current.artworks.length).toBeGreaterThan(beforeLen);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('merged artworks appended; hasMore updated from nextIndex', async () => {
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(GRID_BATCH_SIZE, 1))   // initSearch
      .mockResolvedValueOnce(makeBatch(GRID_BATCH_SIZE, 100)) // prefetch #1
      .mockResolvedValue(makeBatch(GRID_BATCH_SIZE, 200));    // prefetch #2+

    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('artist', 'Rembrandt'); });
    await drain();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const beforeLen = result.current.artworks.length;
    await act(async () => { result.current.loadMore(); });

    expect(result.current.artworks.length).toBeGreaterThan(beforeLen);
    // ALL_IDS has 50 entries; nextIndex after merge < 50 → hasMore=true
    expect(result.current.hasMore).toBe(true);
  });

  it('startPrefetch is triggered again after merge', async () => {
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(GRID_BATCH_SIZE, 1))   // initSearch
      .mockResolvedValueOnce(makeBatch(GRID_BATCH_SIZE, 100)) // prefetch #1
      .mockResolvedValueOnce(makeBatch(GRID_BATCH_SIZE, 200)); // prefetch #2 after merge

    const { result } = renderHook(() => useGridBrowse(), { wrapper });
    act(() => { result.current.initSearch('artist', 'Rembrandt'); });
    await drain();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(batchFetchArtworks).toHaveBeenCalledTimes(2); // initSearch + prefetch #1

    await act(async () => { result.current.loadMore(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(batchFetchArtworks).toHaveBeenCalledTimes(3); // + prefetch #2 after merge
  });
});

// ─── abort ────────────────────────────────────────────────────────────────────

describe('GridBrowseContext — abort', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    batchFetchArtworks.mockResolvedValue(makeBatch(GRID_BATCH_SIZE));
  });

  afterEach(() => vi.useRealTimers());

  it('abort() resets loading and loadingMore to false', async () => {
    let resolveSearch;
    getCachedIDs.mockResolvedValue(null);
    searchByArtist.mockReturnValue(new Promise((res) => { resolveSearch = res; }));

    const { result } = renderHook(() => useGridBrowse(), { wrapper });

    act(() => { result.current.initSearch('artist', 'Monet'); });
    // Advance past NAVIGATION_DELAY_MS so we're awaiting searchByArtist
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    // abort() signals cancellation; unblock the mock so the async chain settles
    act(() => { result.current.abort(); });
    resolveSearch([]); // unblock so fetchBatch's finally block can run
    await drain();

    expect(result.current.loading).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it('new initSearch after abort starts cleanly (no stale state)', async () => {
    getCachedIDs.mockResolvedValue(ALL_IDS);
    searchByArtist.mockResolvedValue(ALL_IDS);

    const { result } = renderHook(() => useGridBrowse(), { wrapper });

    // First search
    act(() => { result.current.initSearch('artist', 'Rembrandt'); });
    await drain();

    // Abort
    await act(async () => { result.current.abort(); });

    // Second search — should work cleanly
    act(() => { result.current.initSearch('artist', 'Vermeer'); });
    await drain();

    expect(result.current.loading).toBe(false);
    expect(result.current.artworks.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
  });
});
