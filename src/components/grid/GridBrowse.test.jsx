/**
 * GridBrowse component tests
 *
 * Covers: result count display, warm empty state, error state retry button.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GridBrowse from './GridBrowse';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));

const mockNavigate = vi.fn();
const mockInitSearch = vi.fn();

// Mutable route params — vi.hoisted so the mock factory can reference it safely
const mockRoute = vi.hoisted(() => ({ params: { artistName: 'Van Gogh' } }));

vi.mock('react-router-dom', () => ({
  useParams: () => mockRoute.params,
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null }),
}));

vi.mock('../common/Banner', () => ({ default: () => <div data-testid="banner" /> }));
vi.mock('../common/LoadingSpinner', () => ({
  default: () => <div />,
  InlineLoader: () => <div />,
}));
vi.mock('../common/SkeletonCard', () => ({ default: () => <div /> }));
vi.mock('../../hooks/useInfiniteScroll', () => ({ default: () => ({ current: null }) }));
vi.mock('../../context/ArtworkModalContext', () => ({
  useArtworkModal: () => ({ openModal: vi.fn() }),
}));

const makeMockArtwork = (id) => ({
  id,
  title: `Artwork ${id}`,
  artistName: 'Test Artist',
  imageUrl: 'https://example.com/img.jpg',
  artistBio: '',
  isHighlight: false,
  artistULAN_URL: '',
  objectURL: '',
  gallery: null,
  city: '',
  country: '',
  creditLine: '',
  accessionYear: '',
  additionalImages: [],
});

const makeContext = (overrides = {}) => ({
  artworks: [],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  initSearch: mockInitSearch,
  loadMore: vi.fn(),
  abort: vi.fn(),
  searchType: 'artist',
  searchTerm: 'Van Gogh',
  ...overrides,
});

vi.mock('../../context/GridBrowseContext', () => ({
  useGridBrowse: vi.fn(),
}));

import { useGridBrowse } from '../../context/GridBrowseContext';

describe('GridBrowse — result count', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('renders result count when all artworks are loaded', () => {
    const artworks = Array.from({ length: 42 }, (_, i) => makeMockArtwork(i));
    useGridBrowse.mockReturnValue(makeContext({ artworks, hasMore: false }));
    render(<GridBrowse type="artist" />);
    expect(screen.getByText('42 artworks found')).toBeTruthy();
  });

  it('does not render result count when artworks list is empty', () => {
    useGridBrowse.mockReturnValue(makeContext({ artworks: [], hasMore: false }));
    const { container } = render(<GridBrowse type="artist" />);
    expect(container.querySelector('.end-message')).toBeNull();
  });

  it('uses singular "artwork" when exactly one artwork is loaded', () => {
    const artworks = [makeMockArtwork(1)];
    useGridBrowse.mockReturnValue(makeContext({ artworks, hasMore: false }));
    render(<GridBrowse type="artist" />);
    expect(screen.getByText('1 artwork found')).toBeTruthy();
  });
});

describe('GridBrowse — first-frame guard', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('shows skeleton (not the empty state) when the context has not initialised for this route', () => {
    // initSearch runs in an effect, so on the first frame the context still
    // holds the PREVIOUS search — the guard must show skeletons, not a
    // spurious "No artworks found" or a stale grid.
    useGridBrowse.mockReturnValue(makeContext({
      artworks: [], loading: false, searchType: 'artist', searchTerm: 'Monet',
    }));
    const { container } = render(<GridBrowse type="artist" />);
    expect(container.querySelector('.empty-state')).toBeNull();
    expect(container.querySelector('.thumbnail-grid')).toBeTruthy();
  });

  it('renders the empty state once the context matches the route term', () => {
    useGridBrowse.mockReturnValue(makeContext({
      artworks: [], loading: false, searchType: 'artist', searchTerm: 'Van Gogh',
    }));
    render(<GridBrowse type="artist" />);
    expect(screen.getByText('No artworks found for this search.')).toBeTruthy();
  });
});

describe('GridBrowse — empty state', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('renders flying machine icon in empty state', () => {
    useGridBrowse.mockReturnValue(makeContext());
    const { container } = render(<GridBrowse type="artist" />);
    const img = container.querySelector('.empty-state-icon');
    expect(img).toBeTruthy();
    expect(img.src).toContain('icon.png');
  });

  it('renders warm empty state message', () => {
    useGridBrowse.mockReturnValue(makeContext());
    render(<GridBrowse type="artist" />);
    expect(screen.getByText('No artworks found for this search.')).toBeTruthy();
  });

  it('renders CTA button in empty state', () => {
    useGridBrowse.mockReturnValue(makeContext());
    render(<GridBrowse type="artist" />);
    expect(screen.getByRole('button', { name: /explore the collection/i })).toBeTruthy();
  });

  it('CTA button navigates to home', () => {
    useGridBrowse.mockReturnValue(makeContext());
    render(<GridBrowse type="artist" />);
    fireEvent.click(screen.getByRole('button', { name: /explore the collection/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});

describe('GridBrowse — end message (T3-A)', () => {
  it('end message includes flying machine icon when results exhausted', () => {
    const artworks = Array.from({ length: 5 }, (_, i) => makeMockArtwork(i));
    useGridBrowse.mockReturnValue(makeContext({ artworks, hasMore: false }));
    const { container } = render(<GridBrowse type="artist" />);
    const icon = container.querySelector('.end-message-icon');
    expect(icon).toBeTruthy();
    expect(icon.tagName).toBe('IMG');
    expect(icon.getAttribute('alt')).toBe('');
  });
});

describe('GridBrowse — malformed URL escape', () => {
  beforeEach(() => mockNavigate.mockClear());
  afterEach(() => {
    mockRoute.params = { artistName: 'Van Gogh' };
  });

  it('renders the raw term in the heading for a malformed percent-escape (/artist/%E0) instead of crashing', () => {
    // decodeURIComponent('%E0') throws URIError — safeDecode must fall back
    // to the raw segment so the page renders instead of white-screening
    mockRoute.params = { artistName: '%E0' };
    useGridBrowse.mockReturnValue(makeContext({ searchTerm: '%E0' }));

    const { container } = render(<GridBrowse type="artist" />);

    const heading = container.querySelector('.search-term');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toBe('@%e0'); // raw term, artist-formatted
  });
});

describe('GridBrowse — error state', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('renders retry button when error is present', () => {
    useGridBrowse.mockReturnValue(makeContext({ error: 'Network error', artworks: [] }));
    render(<GridBrowse type="artist" />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('retry button calls initSearch with type and searchTerm', () => {
    useGridBrowse.mockReturnValue(makeContext({ error: 'Network error', artworks: [] }));
    render(<GridBrowse type="artist" />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockInitSearch).toHaveBeenCalledWith('artist', 'Van Gogh');
  });
});

describe('GridBrowse — search (free-text query)', () => {
  beforeEach(() => mockNavigate.mockClear());
  afterEach(() => {
    mockRoute.params = { artistName: 'Van Gogh' };
  });

  it('reads the term from the :query param and shows it quoted, sans-serif', () => {
    mockRoute.params = { query: 'blue period' };
    useGridBrowse.mockReturnValue(makeContext({
      searchType: 'search', searchTerm: 'blue period',
      artworks: [makeMockArtwork(1)], hasMore: false,
    }));
    const { container } = render(<GridBrowse type="search" />);
    const heading = container.querySelector('.search-term');
    // Verbatim query — no @/# formatting, and the sans-serif query class.
    expect(heading.textContent).toBe('“blue period”');
    expect(heading.className).toContain('search-term--query');
  });

  it('does not render the artist profile header for a query search', () => {
    mockRoute.params = { query: 'blue' };
    useGridBrowse.mockReturnValue(makeContext({
      searchType: 'search', searchTerm: 'blue',
      artworks: [makeMockArtwork(1)], hasMore: false,
    }));
    const { container } = render(<GridBrowse type="search" />);
    expect(container.querySelector('.artist-profile-header')).toBeNull();
  });

  it('retry re-runs initSearch with the search type', () => {
    mockRoute.params = { query: 'blue' };
    useGridBrowse.mockReturnValue(makeContext({
      searchType: 'search', searchTerm: 'blue', error: 'Network error', artworks: [],
    }));
    render(<GridBrowse type="search" />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockInitSearch).toHaveBeenCalledWith('search', 'blue');
  });

  // Regression: /artist, /tag and /search share ONE GridBrowse instance (routes
  // aren't keyed). Navigating between them with the same word changes `type` but
  // not `searchTerm`; the init effect must still re-run or the page wedges on
  // skeletons forever.
  it('re-runs initSearch when only the type changes (tag→search, same word)', () => {
    mockRoute.params = { tagName: 'cats' };
    useGridBrowse.mockReturnValue(makeContext({ searchType: 'tag', searchTerm: 'cats' }));
    const { rerender } = render(<GridBrowse type="tag" />);
    mockInitSearch.mockClear();

    mockRoute.params = { query: 'cats' };
    useGridBrowse.mockReturnValue(makeContext({ searchType: 'tag', searchTerm: 'cats' }));
    rerender(<GridBrowse type="search" />);

    expect(mockInitSearch).toHaveBeenCalledWith('search', 'cats', expect.anything());
  });
});
