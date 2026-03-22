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

// ─── initialBatchSize ─────────────────────────────────────────────────────────

describe('usePaginatedFetch — initialBatchSize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));
  });
  afterEach(() => vi.useRealTimers());

  it('uses initialBatchSize for first fetch and batchSize for background prefetch', async () => {
    const INITIAL = 2;
    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH, initialBatchSize: INITIAL })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // First call: batchFetchArtworks(ids, targetCount=2, signal)
    expect(batchFetchArtworks.mock.calls[0][1]).toBe(INITIAL);
    // Second call (background prefetch): uses full batchSize
    expect(batchFetchArtworks.mock.calls[1][1]).toBe(BATCH);
  });

  it('subsequent loadMore uses batchSize not initialBatchSize', async () => {
    const INITIAL = 2;
    // Reject prefetch so loadMore falls through to fetchBatch(false)
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(BATCH))  // initial fetch
      .mockRejectedValueOnce(new Error('prefetch skip')) // prefetch fails silently
      .mockResolvedValue(makeBatch(BATCH));      // loadMore batch

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH, initialBatchSize: INITIAL })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    await act(async () => { result.current.loadMore(); });
    await drain();

    // loadMore call used batchSize, not initialBatchSize
    const loadMoreCall = batchFetchArtworks.mock.calls[2]; // [0]=initial, [1]=prefetch, [2]=loadMore
    expect(loadMoreCall[1]).toBe(BATCH);
  });
});

// ─── duplicate key regression ─────────────────────────────────────────────────

describe('usePaginatedFetch — duplicate key regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('fetchBatch(false) aborts stale prefetch so its result cannot be merged as duplicates', async () => {
    // Regression: ISSUE-004 — duplicate React key 436536
    // Found by /qa on 2026-03-21
    // Report: .gstack/qa-reports/qa-report-localhost-5173-2026-03-21.md
    //
    // Race: prefetch in-flight while loadMore triggers fetchBatch(false).
    // Both read shownIDsRef at the same moment → overlap. Prefetch then completes
    // and writes stale data to prefetchRef. Next loadMore merges it = duplicate IDs.
    // Fix: fetchBatch always calls startPrefetch, aborting any in-flight prefetch
    // and clearing prefetchRef.current before the stale promise can resolve.

    const ALL_IDS_SHORT = Array.from({ length: 40 }, (_, i) => i + 1);
    fetchIDs.mockResolvedValue(ALL_IDS_SHORT);

    // Deferred promise simulates a slow in-flight prefetch
    let resolveStalePrefetch;
    const stalePrefetchPromise = new Promise(resolve => { resolveStalePrefetch = resolve; });

    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(BATCH, 1))     // initial fetch → IDs 1-4
      .mockReturnValueOnce(stalePrefetchPromise)       // startPrefetch A → stalls
      .mockResolvedValueOnce(makeBatch(BATCH, 5))      // fetchBatch(false) → IDs 5-8
      .mockResolvedValue(makeBatch(BATCH, 9));          // fresh prefetch B → IDs 9-12

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );

    // Initial load — stale prefetch A starts but doesn't resolve yet
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();
    expect(result.current.artworks).toHaveLength(BATCH);

    // loadMore: prefetch not ready → fetchBatch(false) runs.
    // The fix ensures fetchBatch(false) calls startPrefetch, which aborts prefetch A.
    await act(async () => { result.current.loadMore(); });
    await drain();
    expect(result.current.artworks).toHaveLength(BATCH * 2);

    const countAfterFetchBatch = result.current.artworks.length;

    // Now the stale prefetch A resolves with IDs that overlap what fetchBatch(false) loaded.
    // With fix: its AbortController was already signalled → prefetchRef.current stays null.
    // Without fix: prefetchRef.current is set to stale data; next loadMore merges duplicates.
    await act(async () => {
      resolveStalePrefetch(makeBatch(BATCH, 5)); // same IDs 5-8 already in state
      await vi.runAllTimersAsync();
    });

    // Artworks must NOT grow from the stale prefetch resolving
    expect(result.current.artworks.length).toBe(countAfterFetchBatch);

    // And no duplicate IDs in whatever is currently in state
    const ids = result.current.artworks.map(a => a.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});

// ─── circuit breaker silent freeze ───────────────────────────────────────────

describe('usePaginatedFetch — circuit breaker silent freeze', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
  });
  afterEach(() => vi.useRealTimers());

  // Contract: when the circuit breaker is OPEN, batchFetchArtworks throws an AbortError.
  // The hook swallows it silently — no error state, no loading flicker, artworks preserved.
  // This is intentional: the breaker auto-recovers in 5s via HALF_OPEN probe.
  // Showing an error for a transient 5s freeze would be worse UX than a silent stall.
  it('circuit breaker open: feed freezes silently — no error shown, artworks and hasMore preserved', async () => {
    // Initial batch loads fine; prefetch and all subsequent calls simulate breaker OPEN
    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(BATCH))  // initial batch succeeds
      .mockRejectedValue(new DOMException('Circuit breaker open — request rejected', 'AbortError'));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain(); // initial load ok; prefetch attempt catches AbortError silently

    const artworksCount = result.current.artworks.length;
    const hasMoreBefore = result.current.hasMore;

    // loadMore: prefetch failed silently → falls through to fetchBatch(false) → AbortError
    await act(async () => { result.current.loadMore(); });
    await drain();

    expect(result.current.error).toBeNull();                        // no error shown to user
    expect(result.current.artworks.length).toBe(artworksCount);    // existing artworks preserved
    expect(result.current.loadingMore).toBe(false);                 // loading state cleaned up
    expect(result.current.hasMore).toBe(hasMoreBefore);            // hasMore unchanged
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

    expect(result.current.error).toBe("Couldn't load more art. Tap to retry.");
    expect(result.current.error).not.toContain('Internal API error');
  });
});
