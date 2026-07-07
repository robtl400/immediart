/**
 * DiscoveryFeed component tests
 *
 * Covers: first-visit hint overlay (localStorage flag), hover-prefetch debounce,
 * and keyboard shortcuts.
 *
 * Likes now come from useLikes() (LikesContext), not local state, so likes are
 * mocked here via a controllable module-level Set + toggleLike spy. Persistence
 * itself moved to LikesContext and is covered by LikesContext.test.jsx.
 *
 * The modal-open keyboard guard now checks window.location.pathname (an
 * /artwork/:id route on top of the feed), not a context flag — the guard test
 * drives it with window.history.pushState.
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

// Controllable likes: a module-level Set that toggleLike mutates, so a card can
// render "liked" and the keyboard `l` shortcut can be asserted on the spy.
const { likedSet, mockToggleLike } = vi.hoisted(() => {
  const set = new Set();
  return {
    likedSet: set,
    mockToggleLike: vi.fn((id) => {
      const n = Number(id);
      if (set.has(n)) set.delete(n); else set.add(n);
    }),
  };
});
vi.mock('../../context/LikesContext', () => ({
  useLikes: () => ({
    likedIds: likedSet,
    toggleLike: mockToggleLike,
    pruneLike: vi.fn((id) => likedSet.delete(Number(id))),
    isLiked: (id) => likedSet.has(Number(id)),
  }),
}));

const mockArtwork = {
  id: 1, title: 'Starry Night', artistName: 'Van Gogh', username: 'vangogh',
  description: 'A swirling night sky', imageUrl: 'https://x.com/1.jpg',
  tags: ['impressionism'], date: '1889', comments: [],
};

vi.mock('../../context/ArtworksContext', () => ({
  useArtworks: vi.fn(),
}));

vi.mock('../../services/metAPI', () => ({
  searchByArtist: vi.fn().mockResolvedValue([]),
  searchByTag: vi.fn().mockResolvedValue([]),
}));

import { useArtworks } from '../../context/ArtworksContext';
import { searchByArtist, searchByTag } from '../../services/metAPI';

const makeArtworksContext = (overrides = {}) => ({
  artworks: [mockArtwork],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  loadMoreArtworks: vi.fn(),
  retry: vi.fn(),
  pause: vi.fn(),
  // Scroll-restoration ref the feed reads on mount/unmount.
  feedScrollRef: { current: 0 },
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
    expect(screen.getByText(/tap image for details/i)).toBeTruthy();
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

describe('DiscoveryFeed — likes from context', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = makeLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
    likedSet.clear();
    mockToggleLike.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders a card as liked when useLikes reports it liked', () => {
    likedSet.add(1);
    useArtworks.mockReturnValue(makeArtworksContext());
    render(<DiscoveryFeed />);
    expect(document.querySelector('.like-btn.liked')).toBeTruthy();
  });

  it('clicking a card like button calls toggleLike with the card id', () => {
    useArtworks.mockReturnValue(makeArtworksContext());
    render(<DiscoveryFeed />);
    fireEvent.click(document.querySelector('.like-btn'));
    expect(mockToggleLike).toHaveBeenCalledWith(1);
  });
});

describe('DiscoveryFeed — hover prefetch debounce', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = makeLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.useFakeTimers();
    useArtworks.mockReturnValue(makeArtworksContext());
    searchByArtist.mockClear();
    searchByTag.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fires searchByArtist after 150ms debounce on artist chip mouseenter', () => {
    render(<DiscoveryFeed />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /vangogh/i }));
    expect(searchByArtist).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(searchByArtist).toHaveBeenCalledWith('Van Gogh');
  });

  it('fires searchByTag after 150ms debounce on hashtag mouseenter', () => {
    render(<DiscoveryFeed />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /#impressionism/i }));
    expect(searchByTag).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(searchByTag).toHaveBeenCalledWith('impressionism');
  });
});

describe('DiscoveryFeed — keyboard navigation', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = makeLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
    useArtworks.mockReturnValue(makeArtworksContext());
    likedSet.clear();
    mockToggleLike.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('l likes the current card via toggleLike', () => {
    render(<DiscoveryFeed />);
    act(() => { fireEvent.keyDown(document.body, { key: 'l' }); });
    expect(mockToggleLike).toHaveBeenCalledWith(1);
  });

  it('does not hijack keys while the user is typing in an input', () => {
    render(<DiscoveryFeed />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { fireEvent.keyDown(input, { key: 'l' }); });
    expect(mockToggleLike).not.toHaveBeenCalled();
    input.remove();
  });

  it('does not fire feed shortcuts while a modal is open over the feed', () => {
    // The feed stays mounted under the modal (an /artwork/:id route on top); the
    // guard reads window.location.pathname, so simulate the modal route.
    window.history.pushState({}, '', '/artwork/1');
    render(<DiscoveryFeed />);
    act(() => { fireEvent.keyDown(document.body, { key: 'l' }); });
    expect(mockToggleLike).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/');
  });
});
