/**
 * Regression: seed-artworks navigation ordering — pause must fire before navigate,
 * and navigate must include state.seedArtworks = [clickedArtwork].
 *
 * The pre-warm mechanic in handleArtistClick / handleTagClick:
 *   1. pause()        — stops in-flight feed fetches
 *   2. navigate(url, { state: { seedArtworks: [artwork] } })
 *
 * The seed artwork is the clicked card's full data. GridBrowse receives it via
 * location.state and passes it to initSearch so the grid shows it instantly
 * before the ID fetch resolves.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DiscoveryFeed from './DiscoveryFeed';

const { mockPause, mockNavigate, getCallOrder, resetCallOrder } = vi.hoisted(() => {
  const callOrder = [];
  return {
    getCallOrder:   () => [...callOrder],
    resetCallOrder: () => { callOrder.length = 0; },
    mockPause:      vi.fn().mockImplementation(() => callOrder.push('pause')),
    mockNavigate:   vi.fn().mockImplementation(() => callOrder.push('navigate')),
  };
});

const seedArtwork = {
  id: 1, title: 'Starry Night', artistName: 'Van Gogh', username: '@van_gogh',
  description: '', imageUrl: 'https://x.com/1.jpg', tags: ['impressionism'],
  date: '1889', comments: [], gallery: null, city: '', country: '',
  creditLine: '', accessionYear: '', objectURL: '', isHighlight: false,
  artistBio: '', additionalImages: [],
};

vi.mock('../../context/ArtworksContext', () => ({
  useArtworks: () => ({
    artworks: [seedArtwork],
    loading: false, loadingMore: false, error: null, hasMore: true,
    loadMoreArtworks: vi.fn(), retry: vi.fn(),
    pause: mockPause,
  }),
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

vi.mock('../common/Banner', () => ({
  default: () => <div data-testid="banner" />,
}));

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));

describe('DiscoveryFeed — seed-artworks navigation regression', () => {
  beforeEach(() => {
    resetCallOrder();
    mockPause.mockClear();
    mockNavigate.mockClear();
  });

  it('artist click: pause fires before navigate', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /van_gogh/i }));

    const order = getCallOrder();
    expect(order.indexOf('pause')).toBeLessThan(order.indexOf('navigate'));
  });

  it('tag click: pause fires before navigate', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /#impressionism/i }));

    const order = getCallOrder();
    expect(order.indexOf('pause')).toBeLessThan(order.indexOf('navigate'));
  });

  it('artist click: navigate includes state.seedArtworks with the clicked artwork', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /van_gogh/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/artist/Van%20Gogh',
      { state: { seedArtworks: [expect.objectContaining({ id: 1 })] } }
    );
  });

  it('tag click: navigate includes state.seedArtworks with the clicked artwork', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /#impressionism/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/tag/impressionism',
      { state: { seedArtworks: [expect.objectContaining({ id: 1 })] } }
    );
  });

  it('artist click: full ordering is pause → navigate (no initSearch)', () => {
    render(<DiscoveryFeed />);
    fireEvent.click(screen.getByRole('button', { name: /van_gogh/i }));

    expect(getCallOrder()).toEqual(['pause', 'navigate']);
  });
});
