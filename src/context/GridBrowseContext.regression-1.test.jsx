/**
 * Regression: ISSUE-001 — initSearch caused infinite re-render loop on artist/tag navigation
 * Found by /qa on 2026-03-20
 * Report: .gstack/qa-reports/qa-report-localhost-2026-03-20.md
 *
 * Root cause: initSearch's useCallback depended on the entire `grid` object, which is a
 * new reference every render. This made initSearch's identity unstable, causing the
 * useEffect in GridBrowse.jsx (deps: [type, searchTerm, initSearch]) to fire on every
 * render → setSearchType/setSearchTerm/setTotalCount → re-render → repeat.
 *
 * Fix: depend on grid.reset and grid.pause (stable useCallback values) instead.
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

import { searchByArtist, batchFetchArtworks } from '../services/metAPI';
import { getCachedIDs } from '../services/artworkCache';

const ALL_IDS = Array.from({ length: 20 }, (_, i) => i + 1);
const makeRawArtwork = (id) => ({
  objectID: id, title: `Art ${id}`, artistDisplayName: `Artist ${id}`,
  primaryImage: `https://example.com/${id}.jpg`,
  primaryImageSmall: `https://example.com/${id}-sm.jpg`,
  isPublicDomain: true, medium: '', culture: '', period: '', tags: [], department: '', objectDate: '',
});

const wrapper = ({ children }) => <GridBrowseProvider>{children}</GridBrowseProvider>;
const drain = () => act(async () => { await vi.runAllTimersAsync(); });

describe('GridBrowseContext — ISSUE-001 regression: initSearch stability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getCachedIDs.mockResolvedValue(ALL_IDS);
    searchByArtist.mockResolvedValue(ALL_IDS);
    batchFetchArtworks.mockResolvedValue(
      Array.from({ length: GRID_BATCH_SIZE }, (_, i) => makeRawArtwork(i + 1))
    );
  });

  afterEach(() => vi.useRealTimers());

  it('initSearch reference is stable across re-renders caused by state updates', async () => {
    const { result } = renderHook(() => useGridBrowse(), { wrapper });

    const initSearchBefore = result.current.initSearch;

    // Calling initSearch sets searchType, searchTerm, totalCount — triggering re-renders
    act(() => { result.current.initSearch('artist', 'Rembrandt'); });
    await drain();

    // initSearch identity must not change after the state updates it caused
    expect(result.current.initSearch).toBe(initSearchBefore);
  });

  it('initSearch only fires once per call — call count stays bounded, not unbounded', async () => {
    const { result } = renderHook(() => useGridBrowse(), { wrapper });

    act(() => { result.current.initSearch('artist', 'Vermeer'); });
    await drain();

    // After one initSearch + drain: fetchBatch + startPrefetch = 2 calls max.
    // An infinite loop would produce hundreds of calls.
    expect(batchFetchArtworks.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('second initSearch call adds a bounded number of fetches, not unbounded', async () => {
    const { result } = renderHook(() => useGridBrowse(), { wrapper });

    act(() => { result.current.initSearch('artist', 'Rembrandt'); });
    await drain();

    const callsAfterFirst = batchFetchArtworks.mock.calls.length;

    act(() => { result.current.initSearch('artist', 'Monet'); });
    await drain();

    // Each initSearch adds fetchBatch + startPrefetch = at most 2 extra calls.
    // An infinite loop would add hundreds.
    expect(batchFetchArtworks.mock.calls.length).toBeLessThanOrEqual(callsAfterFirst + 4);
  });
});
