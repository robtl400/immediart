/**
 * LikesContext tests
 *
 * Covers: legacy-array → v1 migration, Number normalization, toggle/prune,
 * and cross-tab storage sync (including the no-op guard that prevents a
 * two-tab write ping-pong).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LikesProvider, useLikes } from './LikesContext';

const KEY = 'immediart_liked_artworks';

function makeLocalStorageMock() {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    _dump: () => store,
  };
}

const wrapper = ({ children }) => <LikesProvider>{children}</LikesProvider>;

describe('LikesContext', () => {
  let ls;
  beforeEach(() => {
    ls = makeLocalStorageMock();
    vi.stubGlobal('localStorage', ls);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('migrates a legacy bare array to the { v:1, ids } shape on first mount', () => {
    ls.setItem(KEY, JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useLikes(), { wrapper });

    // Likes are intact...
    expect(result.current.isLiked(1)).toBe(true);
    expect(result.current.isLiked(3)).toBe(true);
    expect(result.current.likedIds.size).toBe(3);
    // ...and persisted forward as the versioned shape.
    expect(JSON.parse(ls.getItem(KEY))).toEqual({ v: 1, ids: [1, 2, 3] });
  });

  it('reads the v1 shape and normalises ids to Number', () => {
    ls.setItem(KEY, JSON.stringify({ v: 1, ids: [7, 8] }));
    const { result } = renderHook(() => useLikes(), { wrapper });
    // A string id (as it arrives from a route param) still matches.
    expect(result.current.isLiked('7')).toBe(true);
    expect(result.current.isLiked(8)).toBe(true);
  });

  it('toggleLike adds and removes; persists as { v:1, ids }', () => {
    const { result } = renderHook(() => useLikes(), { wrapper });
    act(() => result.current.toggleLike('42'));
    expect(result.current.isLiked(42)).toBe(true);
    expect(JSON.parse(ls.getItem(KEY))).toEqual({ v: 1, ids: [42] });
    act(() => result.current.toggleLike(42));
    expect(result.current.isLiked(42)).toBe(false);
  });

  it('pruneLike removes an id but does not re-add it', () => {
    ls.setItem(KEY, JSON.stringify({ v: 1, ids: [5] }));
    const { result } = renderHook(() => useLikes(), { wrapper });
    act(() => result.current.pruneLike('5'));
    expect(result.current.isLiked(5)).toBe(false);
    // pruning an id that isn't liked is a no-op (no throw, still absent)
    act(() => result.current.pruneLike(5));
    expect(result.current.isLiked(5)).toBe(false);
  });

  it('preserves insertion order for newest-first consumers', () => {
    const { result } = renderHook(() => useLikes(), { wrapper });
    act(() => { result.current.toggleLike(1); });
    act(() => { result.current.toggleLike(2); });
    act(() => { result.current.toggleLike(3); });
    expect([...result.current.likedIds]).toEqual([1, 2, 3]);
  });

  it('mirrors a like written by another tab via the storage event', () => {
    const { result } = renderHook(() => useLikes(), { wrapper });
    expect(result.current.isLiked(9)).toBe(false);
    // Another tab wrote likes to storage, then a storage event fires here.
    ls.setItem(KEY, JSON.stringify({ v: 1, ids: [9] }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY })); });
    expect(result.current.isLiked(9)).toBe(true);
  });

  it('ignores a storage event whose content matches (no ping-pong write)', () => {
    ls.setItem(KEY, JSON.stringify({ v: 1, ids: [1, 2] }));
    const { result } = renderHook(() => useLikes(), { wrapper });
    const before = result.current.likedIds;
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY })); });
    // Same content → same Set reference → no re-render/re-write cascade.
    expect(result.current.likedIds).toBe(before);
  });
});
