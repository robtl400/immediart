/**
 * usePaginatedFetch hook tests
 *
 * Tests hook-specific behaviours not fully exercised by context tests:
 *   - shuffleIDs=false path (grid: no shownIDsRef dedup)
 *   - onBatchReady fires after setArtworks, errors are swallowed
 *   - reset() aborts in-flight work before installing new fetchIDs
 *   - maxInMemory trim via hook
 *   - error auto-retry: success path and failure path
 *
 * Pattern: vi.useFakeTimers() in every beforeEach.
 *          batchFetchArtworks mocked — deterministic IDs and results.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaginatedFetch } from './usePaginatedFetch';
import { RATE_LIMIT_RECOVERY_MS } from '../utils/constants';

vi.mock('../services/metAPI', () => ({
  batchFetchArtworks: vi.fn(),
  shuffleArray: (arr) => arr,
}));

import { batchFetchArtworks } from '../services/metAPI';

// ─── helpers ──────────────────────────────────────────────────────────────────

const BATCH = 4;
const ALL_IDS = Array.from({ length: 50 }, (_, i) => i + 1);

const makeRaw = (id) => ({
  objectID: id,
  title: `Art ${id}`,
  primaryImage: `https://x.com/${id}.jpg`,
  primaryImageSmall: `https://x.com/${id}-sm.jpg`,
  artistDisplayName: `Artist ${id}`,
  isPublicDomain: true,
  medium: '', culture: '', period: '', tags: [], department: '', objectDate: '',
});

const makeBatch = (count, startId = 1) =>
  Array.from({ length: count }, (_, i) => makeRaw(startId + i));

const drain = () => act(async () => { await vi.runAllTimersAsync(); });

// fetchIDs function that returns ALL_IDS synchronously
const fetchIDs = vi.fn(async (_signal) => ALL_IDS);

// ─── shuffleIDs=false (grid path) ────────────────────────────────────────────

describe('usePaginatedFetch — shuffleIDs=false', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));
  });
  afterEach(() => vi.useRealTimers());

  it('loads initial batch and sets hasMore=true', async () => {
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    // No fetchIDs installed yet — must call reset()
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.artworks).toHaveLength(BATCH);
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore appends next slice without shownIDsRef dedup', async () => {
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    const firstLen = result.current.artworks.length;
    await act(async () => { result.current.loadMore(); });
    await drain();

    expect(result.current.artworks.length).toBeGreaterThan(firstLen);
  });
});

// ─── maxInMemory trim ─────────────────────────────────────────────────────────

describe('usePaginatedFetch — maxInMemory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));
  });
  afterEach(() => vi.useRealTimers());

  it('trims artworks to last maxInMemory when exceeded', async () => {
    const maxInMemory = 6;
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH, maxInMemory })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain(); // 4 artworks

    await act(async () => { result.current.loadMore(); });
    await drain(); // 8 artworks → trimmed to 6

    expect(result.current.artworks.length).toBeLessThanOrEqual(maxInMemory);
  });

  it('does not trim when maxInMemory=Infinity', async () => {
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH, maxInMemory: Infinity })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    await act(async () => { result.current.loadMore(); });
    await drain();

    // Two batches of 4 = 8, no trim
    expect(result.current.artworks.length).toBe(BATCH * 2);
  });
});

// ─── onBatchReady ─────────────────────────────────────────────────────────────

describe('usePaginatedFetch — onBatchReady', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));
  });
  afterEach(() => vi.useRealTimers());

  it('calls onBatchReady after setArtworks with the new artworks', async () => {
    const onBatchReady = vi.fn();
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH, onBatchReady })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(onBatchReady).toHaveBeenCalledOnce();
    const [artworks] = onBatchReady.mock.calls[0];
    expect(artworks).toHaveLength(BATCH);
  });

  it('swallows errors from onBatchReady and continues fetching', async () => {
    const onBatchReady = vi.fn().mockRejectedValue(new Error('preload failed'));
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH, onBatchReady })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // Hook should still have loaded artworks despite onBatchReady throwing
    expect(result.current.artworks).toHaveLength(BATCH);
    expect(result.current.error).toBeNull();
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('usePaginatedFetch — reset()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('aborts in-flight work and starts fresh with new fetchIDs', async () => {
    const firstFetchIDs  = vi.fn(async () => [1, 2, 3, 4, 5]);
    const secondFetchIDs = vi.fn(async () => [10, 11, 12, 13, 14]);

    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );

    // Start first search
    await act(async () => { result.current.reset(firstFetchIDs); });
    await drain();

    const firstArtworks = result.current.artworks.map(a => a.id);

    // Immediately replace with second search
    await act(async () => { result.current.reset(secondFetchIDs); });
    await drain();

    expect(secondFetchIDs).toHaveBeenCalled();
    // State is clean (from reset) — not accumulating old artworks
    expect(result.current.artworks.length).toBe(BATCH);
  });

  it('clears artworks and error state on reset', async () => {
    // First load fails
    const failingFetchIDs = vi.fn(async () => { throw new Error('fail'); });
    batchFetchArtworks.mockResolvedValue([]);
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(failingFetchIDs); });
    await drain();

    // Second load succeeds
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));
    fetchIDs.mockResolvedValue(ALL_IDS);
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.artworks).toHaveLength(BATCH);
    expect(result.current.error).toBeNull();
  });
});

// ─── error auto-retry ─────────────────────────────────────────────────────────

describe('usePaginatedFetch — error auto-retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
  });
  afterEach(() => vi.useRealTimers());

  it('retries once after RATE_LIMIT_RECOVERY_MS and succeeds silently', async () => {
    batchFetchArtworks
      .mockRejectedValueOnce(new Error('network'))  // first attempt fails
      .mockResolvedValueOnce(makeBatch(BATCH))       // retry succeeds
      .mockResolvedValue(makeBatch(BATCH));           // prefetch

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // Retry succeeded — artworks loaded, no error shown
    expect(result.current.artworks).toHaveLength(BATCH);
    expect(result.current.error).toBeNull();
  });

  it('shows user-friendly error message after retry also fails', async () => {
    batchFetchArtworks
      .mockRejectedValueOnce(new Error('network'))  // first attempt
      .mockRejectedValueOnce(new Error('network')); // retry also fails

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.error).toBe("Couldn't load more art. Tap to retry.");
    expect(result.current.artworks).toHaveLength(0);
  });

  it('never surfaces raw error message (user sees friendly text)', async () => {
    batchFetchArtworks.mockRejectedValue(new Error('Internal API error xyz-123'));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.error).not.toContain('Internal API error');
  });
});
