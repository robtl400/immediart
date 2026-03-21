/**
 * Regression: Pre-warm ordering — initSearch must fire BEFORE navigate on artist/tag click.
 *
 * The pre-warm mechanic in handleArtistClick / handleTagClick:
 *   1. pause()        — stops in-flight feed fetches
 *   2. initSearch()   — starts grid ID fetch while route transition completes (pre-warm)
 *   3. navigate()     — triggers route change
 *
 * If navigate fires before initSearch, the pre-warm benefit is lost: GridBrowseContext
 * would only start the ID fetch after the grid route component mounts, not before.
 * The difference is visible on cold cache: the grid page shows a skeleton for an extra
 * 150–300ms (NAVIGATION_DELAY_MS + any SEARCH_COOLDOWN_MS) instead of appearing instantly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DiscoveryFeed from './DiscoveryFeed';

// vi.hoisted() ensures these mocks are available inside vi.mock() factory functions,
// which are hoisted to the top of the file before any const declarations.
const { mockPause, mockInitSearch, mockNavigate, getCallOrder, resetCallOrder } = vi.hoisted(() => {
  const callOrder = [];
  return {
    getCallOrder:   () => [...callOrder],
    resetCallOrder: () => { callOrder.length = 0; },
    mockPause:      vi.fn().mockImplementation(() => callOrder.push('pause')),
    mockInitSearch: vi.fn().mockImplementation(() => callOrder.push('initSearch')),
    mockNavigate:   vi.fn().mockImplementation(() => callOrder.push('navigate')),
  };
});

vi.mock('../../context/ArtworksContext', () => ({
  useArtworks: () => ({
    artworks: [{
      id: 1, title: 'Starry Night', artistName: 'Van Gogh', username: 'vangogh',
      description: '', imageUrl: 'https://x.com/1.jpg', tags: ['impressionism'],
      date: '1889', comments: [],
    }],
    loading: false, loadingMore: false, error: null, hasMore: true,
    loadMoreArtworks: vi.fn(), retry: vi.fn(),
    pause: mockPause,
  }),
}));

vi.mock('../../context/GridBrowseContext', () => ({
  useGridBrowse: () => ({ initSearch: mockInitSearch }),
}));

vi.mock('../../context/ArtworkModalContext', () => ({
  useArtworkModal: () => ({ openModal: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../hooks/useInfiniteScroll', () => ({
  default: () => ({ current: null }),
}));

// Banner uses scroll + ref — mock to keep test focused on click ordering
vi.mock('../common/Banner', () => ({
  default: () => <div data-testid="banner" />,
}));

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));

describe('DiscoveryFeed — pre-warm ordering regression', () => {
  beforeEach(() => {
    resetCallOrder();
    mockPause.mockClear();
    mockInitSearch.mockClear();
    mockNavigate.mockClear();
  });

  it('artist click: initSearch fires before navigate', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /vangogh/i }));

    const order = getCallOrder();
    expect(order).toContain('initSearch');
    expect(order).toContain('navigate');
    expect(order.indexOf('initSearch')).toBeLessThan(order.indexOf('navigate'));
  });

  it('tag click: initSearch fires before navigate', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /#impressionism/i }));

    const order = getCallOrder();
    expect(order).toContain('initSearch');
    expect(order).toContain('navigate');
    expect(order.indexOf('initSearch')).toBeLessThan(order.indexOf('navigate'));
  });

  it('artist click: full ordering is pause → initSearch → navigate', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /vangogh/i }));

    expect(getCallOrder()).toEqual(['pause', 'initSearch', 'navigate']);
  });

  it('artist click: initSearch called with correct type and name', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /vangogh/i }));

    expect(mockInitSearch).toHaveBeenCalledWith('artist', 'Van Gogh');
  });

  it('tag click: initSearch called with correct type and tag', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /#impressionism/i }));

    expect(mockInitSearch).toHaveBeenCalledWith('tag', 'impressionism');
  });
});
