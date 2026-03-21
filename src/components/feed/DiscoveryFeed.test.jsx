/**
 * DiscoveryFeed component tests
 *
 * Covers: first-visit hint overlay (localStorage flag), likes persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DiscoveryFeed from './DiscoveryFeed';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../common/Banner', () => ({ default: () => <div data-testid="banner" /> }));
vi.mock('../common/LoadingSpinner', () => ({
  default: () => <div />,
  InlineLoader: () => <div />,
}));
vi.mock('../common/SkeletonCard', () => ({ default: () => <div /> }));
vi.mock('../../hooks/useInfiniteScroll', () => ({ default: () => ({ current: null }) }));
vi.mock('../../context/GridBrowseContext', () => ({
  useGridBrowse: () => ({ initSearch: vi.fn() }),
}));
vi.mock('../../context/ArtworkModalContext', () => ({
  useArtworkModal: () => ({ openModal: vi.fn() }),
}));

const mockArtwork = {
  id: 1, title: 'Starry Night', artistName: 'Van Gogh', username: 'vangogh',
  description: 'A swirling night sky', imageUrl: 'https://x.com/1.jpg',
  tags: ['impressionism'], date: '1889', comments: [],
};

vi.mock('../../context/ArtworksContext', () => ({
  useArtworks: vi.fn(),
}));

import { useArtworks } from '../../context/ArtworksContext';

const makeArtworksContext = (overrides = {}) => ({
  artworks: [mockArtwork],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  loadMoreArtworks: vi.fn(),
  retry: vi.fn(),
  pause: vi.fn(),
  ...overrides,
});

// Build a real in-memory localStorage mock for environments where jsdom's localStorage
// is not a full Storage object (e.g. when --localstorage-file is missing).
function makeLocalStorageMock() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}

describe('DiscoveryFeed — first-visit hint', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = makeLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders hint when localStorage flag is not set', () => {
    useArtworks.mockReturnValue(makeArtworksContext());
    render(<DiscoveryFeed />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/double-tap image for details/i)).toBeTruthy();
  });

  it('does not render hint when localStorage flag is set', () => {
    localStorageMock.setItem('immediart_hint_seen', '1');
    useArtworks.mockReturnValue(makeArtworksContext());
    render(<DiscoveryFeed />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('auto-dismisses hint and sets localStorage flag after timeout', () => {
    vi.useFakeTimers();
    useArtworks.mockReturnValue(makeArtworksContext());
    render(<DiscoveryFeed />);
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole('status')).toBeNull();
    expect(localStorageMock.getItem('immediart_hint_seen')).toBe('1');
  });
});

describe('DiscoveryFeed — likes persistence', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = makeLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes likes from localStorage on mount', () => {
    localStorageMock.setItem('immediart_liked_artworks', JSON.stringify([1]));
    useArtworks.mockReturnValue(makeArtworksContext());
    render(<DiscoveryFeed />);
    const likeBtn = document.querySelector('.like-btn.liked');
    expect(likeBtn).toBeTruthy();
  });

  it('handleLike writes to localStorage', () => {
    useArtworks.mockReturnValue(makeArtworksContext());
    render(<DiscoveryFeed />);
    const likeBtn = document.querySelector('.like-btn');
    fireEvent.click(likeBtn);
    const stored = JSON.parse(localStorageMock.getItem('immediart_liked_artworks'));
    expect(stored).toContain(1);
  });
});
