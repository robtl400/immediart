/**
 * LikedGrid — the /liked consumer of the per-id outcome contract.
 *
 * Covers the one rule the outcome statuses exist for: a like is pruned only on
 * a LIVE 404 ('notFound'), never on a cached tombstone ('notFoundCached') or a
 * transient failure ('error').
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import LikedGrid from './LikedGrid';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ key: 'abc', state: null }) }));
vi.mock('../common/Banner', () => ({ default: () => <div /> }));
vi.mock('../common/LoadingSpinner', () => ({ default: () => <div />, InlineLoader: () => <div /> }));
vi.mock('../common/SkeletonCard', () => ({ default: () => <div /> }));
vi.mock('./ThumbnailCard', () => ({ default: () => <div /> }));
vi.mock('../../hooks/useInfiniteScroll', () => ({ default: () => ({ current: null }) }));
vi.mock('../../context/ArtworkModalContext', () => ({ useArtworkModal: () => ({ openModal: vi.fn() }) }));
vi.mock('../../utils/imageLoader', () => ({ preloadArtworkImages: vi.fn() }));

const likes = vi.hoisted(() => ({ pruneLike: vi.fn() }));
vi.mock('../../context/LikesContext', () => ({
  useLikes: () => ({ likedIds: new Set([1, 2, 3, 4]), isLiked: () => true, toggleLike: vi.fn(), pruneLike: likes.pruneLike }),
}));

// Capture the options LikedGrid hands the hook so the test can drive onBatchReady.
const hook = vi.hoisted(() => ({ options: null }));
vi.mock('../../hooks/usePaginatedFetch', () => ({
  usePaginatedFetch: (options) => {
    hook.options = options;
    return {
      artworks: [], loading: false, loadingMore: false, error: null, hasMore: false,
      loadMore: vi.fn(), retryLoadMore: vi.fn(), reset: vi.fn(), pause: vi.fn(),
    };
  },
}));

describe('LikedGrid — like pruning', () => {
  beforeEach(() => {
    likes.pruneLike.mockClear();
    render(<LikedGrid />);
  });

  it('prunes a like only on a LIVE 404 — never on a cached tombstone or a transient error', () => {
    const outcomes = new Map([
      [1, 'notFound'],        // live 404: prune
      [2, 'notFoundCached'],  // tombstone answered from cache: keep
      [3, 'error'],           // transient: keep
      [4, 'invalid'],         // exists, fails validation: keep
    ]);
    hook.options.onBatchReady([], undefined, outcomes);
    expect(likes.pruneLike).toHaveBeenCalledTimes(1);
    expect(likes.pruneLike).toHaveBeenCalledWith(1);
  });

  it('reads outcomes even when the batch carried no artworks (an outage window)', () => {
    hook.options.onBatchReady([], undefined, new Map([[2, 'notFound']]));
    expect(likes.pruneLike).toHaveBeenCalledWith(2);
  });

  it('tolerates a missing outcomes map', () => {
    expect(() => hook.options.onBatchReady([], undefined, undefined)).not.toThrow();
    expect(likes.pruneLike).not.toHaveBeenCalled();
  });
});
