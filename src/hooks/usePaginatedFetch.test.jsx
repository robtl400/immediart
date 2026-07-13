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
}));

vi.mock('../utils/shuffle', () => ({
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

const makeRawList = (count, startId = 1) =>
  Array.from({ length: count }, (_, i) => makeRaw(startId + i));

// batchFetchArtworks now returns { artworks, outcomes, consumedCount }.
// Default models "the first `count` candidates were all used" (consumedCount = count).
const makeBatch = (count, startId = 1, consumedCount = count) => ({
  artworks: makeRawList(count, startId),
  outcomes: new Map(),
  consumedCount,
});

const drain = () => act(async () => { await vi.runAllTimersAsync(); });

// fetchIDs function that returns ALL_IDS synchronously
const fetchIDs = vi.fn(async () => ALL_IDS);

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

// ─── resume-index derivation (per-ID outcome contract) ────────────────────────
//
// Regression: batchFetchArtworks over-fetches (2× the target), then discards
// the surplus. The OLD contract advanced the index by a raw count, permanently
// skipping the over-fetched-but-discarded and never-attempted candidates. The
// new contract advances only past the id that produced the LAST kept artwork —
// consumedCount — so those candidates stay visitable next round.

describe('usePaginatedFetch — resume index respects consumedCount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
  });
  afterEach(() => vi.useRealTimers());

  it('grid: candidates beyond consumedCount are NOT skipped on the next fetch', async () => {
    // First batch is offered [1..8] (limit = batchSize*2) but reports only the
    // first 2 candidates consumed. The follow-up call must resume at id 3.
    batchFetchArtworks.mockResolvedValue({
      artworks: makeRawList(2, 1),
      outcomes: new Map(),
      consumedCount: 2,
    });

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // Call 0 = initial fetch on [1..8]; call 1 = the prefetch that follows.
    // Its first candidate must be id 3 (index 2), proving 3-8 were not skipped.
    // The buggy raw-count advance would have jumped to id 9.
    expect(batchFetchArtworks.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(batchFetchArtworks.mock.calls[1][0][0]).toBe(3);
  });

  it('shuffled feed: over-fetched candidates resume; only kept ids are deduped', async () => {
    // shuffleArray is mocked to identity, so allIDsRef === ALL_IDS = [1..50].
    batchFetchArtworks.mockResolvedValue({
      artworks: makeRawList(2, 1), // kept ids 1,2
      outcomes: new Map(),
      consumedCount: 2,
    });

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // Next candidate window starts at id 3 — candidates 3-12 offered on the
    // first batch were not consumed, so they are re-offered rather than lost.
    expect(batchFetchArtworks.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(batchFetchArtworks.mock.calls[1][0][0]).toBe(3);
    // Only the 2 kept ids entered the shown set, so id 3+ is still a candidate
    // (if all 12 offered ids had been marked shown, call 1 would start past 12).
    expect(batchFetchArtworks.mock.calls[1][0]).toContain(3);
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
    batchFetchArtworks.mockResolvedValue(makeBatch(0));
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

  it('loadMore during an in-flight prefetch JOINS it — one merge, no duplicate batch, no duplicate ids', async () => {
    // Regression lineage: ISSUE-004 — duplicate React key 436536 (found by /qa
    // on 2026-03-21; report: .gstack/qa-reports/qa-report-localhost-5173-2026-03-21.md).
    // The original race was "prefetch in-flight while loadMore runs
    // fetchBatch(false)" — first fixed by aborting the stale prefetch (wasting
    // its requests), now fixed structurally: loadMore never races an in-flight
    // prefetch, it awaits the same promise and merges its result once.

    const ALL_IDS_SHORT = Array.from({ length: 40 }, (_, i) => i + 1);
    fetchIDs.mockResolvedValue(ALL_IDS_SHORT);

    // Deferred promise simulates a slow in-flight prefetch
    let resolvePrefetch;
    const slowPrefetchPromise = new Promise(resolve => { resolvePrefetch = resolve; });

    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(BATCH, 1))  // initial fetch → IDs 1-4
      .mockReturnValueOnce(slowPrefetchPromise)     // startPrefetch A → stalls
      .mockResolvedValue(makeBatch(BATCH, 9));      // follow-up prefetch B → IDs 9-12

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );

    // Initial load — prefetch A starts but doesn't resolve yet
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();
    expect(result.current.artworks).toHaveLength(BATCH);
    const callsBeforeLoadMore = batchFetchArtworks.mock.calls.length; // initial + prefetch A

    // loadMore with prefetch A still in flight: joins it — shows the loading
    // indicator, does NOT start a duplicate batch.
    await act(async () => { result.current.loadMore(); });
    expect(result.current.loadingMore).toBe(true);
    expect(batchFetchArtworks.mock.calls.length).toBe(callsBeforeLoadMore);

    // Prefetch A lands → the join merges its artworks exactly once and kicks
    // off follow-up prefetch B.
    await act(async () => {
      resolvePrefetch({
        artworks: makeRawList(BATCH, 5), // IDs 5-8
        outcomes: new Map(),
        consumedCount: BATCH,
      });
      await vi.runAllTimersAsync();
    });

    expect(result.current.loadingMore).toBe(false);
    expect(result.current.artworks).toHaveLength(BATCH * 2);

    // No duplicate IDs in state
    const ids = result.current.artworks.map(a => a.id);
    expect(ids.length).toBe(new Set(ids).size);

    // Exactly one extra call happened (prefetch B) — the join itself fetched nothing
    expect(batchFetchArtworks.mock.calls.length).toBe(callsBeforeLoadMore + 1);
  });

  it('pause() during a join clears loadingMore when the prefetch settles — no merge, no fetch', async () => {
    fetchIDs.mockResolvedValue(ALL_IDS);

    let resolvePrefetch;
    const slowPrefetchPromise = new Promise(resolve => { resolvePrefetch = resolve; });

    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(BATCH, 1))  // initial fetch → IDs 1-4
      .mockReturnValueOnce(slowPrefetchPromise);    // prefetch A → stalls

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // Join the stalled prefetch, then navigate away (pause aborts it)
    await act(async () => { result.current.loadMore(); });
    expect(result.current.loadingMore).toBe(true);
    await act(async () => { result.current.pause(); });

    const callsAfterPause = batchFetchArtworks.mock.calls.length;

    // The (aborted) prefetch settles: the join must release the loading flag
    // without merging anything or starting a new fetch.
    await act(async () => {
      resolvePrefetch(makeBatch(BATCH, 5));
      await vi.runAllTimersAsync();
    });

    expect(result.current.loadingMore).toBe(false);
    expect(result.current.artworks).toHaveLength(BATCH); // nothing merged
    expect(batchFetchArtworks.mock.calls.length).toBe(callsAfterPause); // nothing fetched
  });

  it('reset() during a join: the stale prefetch settling neither merges nor touches the new fetch', async () => {
    fetchIDs.mockResolvedValue(ALL_IDS);

    let resolvePrefetch;
    const slowPrefetchPromise = new Promise(resolve => { resolvePrefetch = resolve; });

    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(BATCH, 1))   // initial fetch → IDs 1-4
      .mockReturnValueOnce(slowPrefetchPromise)      // prefetch A → stalls
      .mockResolvedValue(makeBatch(BATCH, 101));     // new search's batches → IDs 101+

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // Join the stalled prefetch, then reset to a new search mid-join
    await act(async () => { result.current.loadMore(); });
    expect(result.current.loadingMore).toBe(true);
    const newFetchIDs = vi.fn(async () => Array.from({ length: 20 }, (_, i) => 101 + i));
    await act(async () => { result.current.reset(newFetchIDs); });
    await drain();

    const artworksAfterReset = result.current.artworks.map(a => a.id);
    const callsAfterReset = batchFetchArtworks.mock.calls.length;

    // The OLD search's prefetch settles: the stale join must not merge its
    // artworks into the new search's feed, fetch anything, or clear the new
    // fetch's flags.
    await act(async () => {
      resolvePrefetch(makeBatch(BATCH, 5)); // ids 5-8 from the old search
      await vi.runAllTimersAsync();
    });

    expect(result.current.artworks.map(a => a.id)).toEqual(artworksAfterReset);
    expect(batchFetchArtworks.mock.calls.length).toBe(callsAfterReset);
    expect(result.current.loadingMore).toBe(false);
  });

  it('prefetch fails while joined: the join falls back to a real fetchBatch(false)', async () => {
    fetchIDs.mockResolvedValue(ALL_IDS);

    let rejectPrefetch;
    const slowPrefetchPromise = new Promise((_, reject) => { rejectPrefetch = reject; });

    batchFetchArtworks
      .mockResolvedValueOnce(makeBatch(BATCH, 1))   // initial fetch → IDs 1-4
      .mockReturnValueOnce(slowPrefetchPromise)      // prefetch A → stalls, then fails
      .mockResolvedValue(makeBatch(BATCH, 5));       // fallback fetchBatch + prefetch B

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    await act(async () => { result.current.loadMore(); });
    expect(result.current.loadingMore).toBe(true);
    const callsBefore = batchFetchArtworks.mock.calls.length;

    await act(async () => {
      rejectPrefetch(new Error('network'));
      await vi.runAllTimersAsync();
    });

    // The join recovered by fetching for real
    expect(result.current.artworks).toHaveLength(BATCH * 2);
    expect(result.current.loadingMore).toBe(false);
    expect(batchFetchArtworks.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('pause() during the initial ID fetch: a later loadMore re-runs the initial phase (no silent dead feed)', async () => {
    // Regression (red team): navigate away while the FIRST load is fetching IDs
    // → pause() aborts with allIDsRef still empty → returning to the feed,
    // loadMore used to run fetchBatch(false) against zero candidates and set
    // hasMore=false — no cards, no error, no retry. It must instead re-run the
    // initial phase, like retryLoadMore does.
    const abortableFetchIDs = vi.fn((signal) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')), { once: true });
      })
    );
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH, 1));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );

    // Initial load starts fetching IDs; user navigates away before they arrive
    await act(async () => { result.current.reset(abortableFetchIDs); });
    await act(async () => { result.current.pause(); });
    await drain();
    expect(result.current.artworks).toHaveLength(0);
    expect(result.current.hasMore).toBe(true); // not dead-ended by the abort

    // Back on the feed: the sentinel fires loadMore — IDs load and cards appear
    abortableFetchIDs.mockResolvedValue(ALL_IDS);
    await act(async () => { result.current.loadMore(); });
    await drain();

    expect(abortableFetchIDs.mock.calls.length).toBeGreaterThanOrEqual(2); // initial phase re-ran
    expect(result.current.artworks).toHaveLength(BATCH);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
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

// ─── circuit breaker open error ──────────────────────────────────────────────

describe('usePaginatedFetch — circuit breaker open error', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
  });
  afterEach(() => vi.useRealTimers());

  // Regression: batchFetchArtworks rejecting with Error('Circuit breaker open')
  // previously returned silently — the feed stalled with no error UI. The hook
  // must now surface the retry affordance immediately (no auto-retry: retrying
  // right away would just hit the open breaker again).
  it("sets \"Couldn't load more art. Tap to retry.\" instead of silently returning", async () => {
    batchFetchArtworks.mockRejectedValue(new Error('Circuit breaker open'));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.error).toBe("Couldn't load more art. Tap to retry.");
    expect(result.current.loading).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    // No auto-retry against a known-open breaker — single attempt only
    expect(batchFetchArtworks).toHaveBeenCalledTimes(1);
  });

  it('surfaces an offline-specific message when navigator reports offline', async () => {
    const onlineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    batchFetchArtworks.mockRejectedValue(new Error('Circuit breaker open'));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.error).toBe('You appear to be offline. Reconnect and tap to retry.');
    onlineSpy.mockRestore();
  });

  // Regression: when the INITIAL fetchIDs call is what failed (e.g. a seeded
  // grid whose search hit the open breaker), retryLoadMore must re-run the
  // initial phase — fetchBatch(false) against the empty ID list would set
  // hasMore=false and dead-end the view with no retry affordance.
  it('retryLoadMore re-runs the initial phase when IDs never loaded', async () => {
    fetchIDs
      .mockRejectedValueOnce(new Error('Circuit breaker open'))
      .mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(makeBatch(BATCH));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs, [{ id: 999 }]); });
    await drain();

    expect(result.current.error).toBe("Couldn't load more art. Tap to retry.");

    await act(async () => { result.current.retryLoadMore(); });
    await drain();

    expect(result.current.error).toBeNull();
    expect(fetchIDs).toHaveBeenCalledTimes(2); // initial phase re-ran
    expect(result.current.hasMore).toBe(true);
    expect(result.current.artworks.length).toBeGreaterThan(1); // seed + fresh batch
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

// ─── error gate & retryLoadMore ──────────────────────────────────────────────

describe('usePaginatedFetch — loadMore error gate & retryLoadMore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
  });
  afterEach(() => vi.useRealTimers());

  it('loadMore is a no-op while error is set (no batchFetchArtworks call)', async () => {
    // Breaker-open error surfaces immediately with no auto-retry — exactly 1 call
    batchFetchArtworks.mockRejectedValue(new Error('Circuit breaker open'));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.error).toBe("Couldn't load more art. Tap to retry.");
    const callsBefore = batchFetchArtworks.mock.calls.length;

    // While error is set, the sentinel-driven loadMore must not re-fire
    await act(async () => { result.current.loadMore(); });
    await drain();

    expect(batchFetchArtworks.mock.calls.length).toBe(callsBefore);
    expect(result.current.error).toBe("Couldn't load more art. Tap to retry.");
  });

  it('retryLoadMore clears the error and fetches the next batch', async () => {
    batchFetchArtworks
      .mockRejectedValueOnce(new Error('Circuit breaker open')) // initial batch fails fast
      .mockResolvedValue(makeBatch(BATCH));                      // retry batch + prefetch succeed

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    expect(result.current.error).toBe("Couldn't load more art. Tap to retry.");
    expect(result.current.artworks).toHaveLength(0);

    await act(async () => { result.current.retryLoadMore(); });
    await drain();

    expect(result.current.error).toBeNull();
    expect(result.current.artworks).toHaveLength(BATCH);
    expect(batchFetchArtworks.mock.calls.length).toBeGreaterThan(1);
  });
});

// ─── progressive per-card render ──────────────────────────────────────────────
//
// batchFetchArtworks emits each kept artwork via onArtwork as soon as it is
// knowable (in id order); the hook appends it to state immediately instead of
// waiting for the whole batch. The batch's returned array is a safety net —
// anything already streamed must NOT be appended twice, and a mid-batch
// failure must retry only the un-kept ids.

describe('usePaginatedFetch — progressive render (onArtwork streaming)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
  });
  afterEach(() => vi.useRealTimers());

  const deferred = () => {
    let resolve, reject;
    const p = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { p, resolve, reject };
  };

  it('appends each card as it emits, before the batch resolves — no duplicates after', async () => {
    const gate = deferred();
    let emit;
    batchFetchArtworks.mockImplementation(async (ids, target, signal, opts) => {
      emit = opts.onArtwork;
      return gate.p; // batch stays pending until the test releases it
    });

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await act(async () => { await Promise.resolve(); }); // let fetchIDs settle

    // Batch still pending — stream two cards
    await act(async () => { emit(makeRaw(1), 0); });
    expect(result.current.artworks.map(a => a.id)).toEqual([1]);
    expect(result.current.loading).toBe(true); // batch not done yet

    await act(async () => { emit(makeRaw(2), 1); });
    expect(result.current.artworks.map(a => a.id)).toEqual([1, 2]);

    // Batch resolves, returning the same artworks it already emitted
    gate.resolve({ artworks: makeRawList(2, 1), outcomes: new Map(), consumedCount: 2 });
    await drain();

    expect(result.current.artworks.map(a => a.id)).toEqual([1, 2]); // no re-add
    expect(result.current.loading).toBe(false);
  });

  it('mid-batch failure: streamed cards stay, retry excludes them and reduces the target', async () => {
    const calls = [];
    batchFetchArtworks
      // Attempt 1: emits id 1, then dies mid-batch
      .mockImplementationOnce(async (ids, target, signal, opts) => {
        calls.push({ ids: [...ids], target });
        opts.onArtwork(makeRaw(1), 0);
        throw new Error('network hiccup');
      })
      // Retry: must receive the remaining ids and a reduced target
      .mockImplementationOnce(async (ids, target, signal, opts) => {
        calls.push({ ids: [...ids], target });
        ids.slice(0, target).forEach((id, k) => opts.onArtwork(makeRaw(id), k));
        return { artworks: ids.slice(0, target).map(makeRaw), outcomes: new Map(), consumedCount: target };
      })
      // Prefetch after success — never merged in this test
      .mockImplementation(async () => new Promise(() => {}));

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain(); // runs the failure, the RATE_LIMIT_RECOVERY_MS wait, and the retry

    // Attempt 1 saw the full window [1..8]; retry saw [2..8] with target 3
    expect(calls[0].ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(calls[0].target).toBe(BATCH);
    expect(calls[1].ids).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(calls[1].target).toBe(BATCH - 1);

    // Card 1 streamed before the failure + 3 retry cards — no duplicates
    expect(result.current.artworks.map(a => a.id)).toEqual([1, 2, 3, 4]);
    expect(result.current.error).toBeNull();
  });

  it('feed (shuffleIDs=true): streamed ids are recorded so later batches skip them', async () => {
    batchFetchArtworks
      .mockImplementationOnce(async (ids, target, signal, opts) => {
        ids.slice(0, target).forEach((id, k) => opts.onArtwork(makeRaw(id), k));
        return { artworks: ids.slice(0, target).map(makeRaw), outcomes: new Map(), consumedCount: target };
      })
      .mockImplementation(async () => new Promise(() => {})); // park the prefetch

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: true, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    const ids = result.current.artworks.map(a => a.id);
    expect(ids).toEqual([1, 2, 3, 4]);
    expect(new Set(ids).size).toBe(ids.length); // dedup intact
  });
});

// ─── never-revisit streamed ids after a failure (grid duplicate regression) ───
//
// Grids (shuffleIDs=false) have no shownIDsRef dedup. If a batch streams cards
// and THEN fails hard (e.g. breaker opens), the cursor must advance past the
// streamed ids before the error is surfaced — otherwise retryLoadMore
// re-collects the same window and renders duplicate cards.

describe('usePaginatedFetch — streamed ids survive a hard failure without duplicates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchIDs.mockResolvedValue(ALL_IDS);
  });
  afterEach(() => vi.useRealTimers());

  it('grid: breaker-open after streaming → retryLoadMore does not re-render streamed cards', async () => {
    const calls = [];
    batchFetchArtworks
      // Attempt 1: streams ids 1 and 2, then the breaker opens (no auto-retry path)
      .mockImplementationOnce(async (ids, target, signal, opts) => {
        calls.push([...ids]);
        opts.onArtwork(makeRaw(1), 0);
        opts.onArtwork(makeRaw(2), 1);
        throw new Error('Circuit breaker open');
      })
      // Manual retry: must NOT be offered ids 1-2 again
      .mockImplementationOnce(async (ids, target, signal, opts) => {
        calls.push([...ids]);
        ids.slice(0, target).forEach((id, k) => opts.onArtwork(makeRaw(id), k));
        return { artworks: ids.slice(0, target).map(makeRaw), outcomes: new Map(), consumedCount: target };
      })
      .mockImplementation(async () => new Promise(() => {})); // park the prefetch

    const { result } = renderHook(() =>
      usePaginatedFetch({ shuffleIDs: false, batchSize: BATCH })
    );
    await act(async () => { result.current.reset(fetchIDs); });
    await drain();

    // Breaker-open surfaces the error immediately; streamed cards stay
    expect(result.current.error).not.toBeNull();
    expect(result.current.artworks.map(a => a.id)).toEqual([1, 2]);

    await act(async () => { result.current.retryLoadMore(); });
    await drain();

    // Retry window starts AFTER the streamed ids — no duplicates
    expect(calls[1][0]).toBeGreaterThan(2);
    const ids = result.current.artworks.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 2)).toEqual([1, 2]);
    expect(result.current.error).toBeNull();
  });
});
