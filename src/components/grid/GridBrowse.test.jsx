/**
 * GridBrowse component tests
 *
 * Covers: result count display, warm empty state, error state retry button.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GridBrowse from './GridBrowse';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));

const mockNavigate = vi.fn();
const mockInitSearch = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ artistName: 'Van Gogh' }),
  useNavigate: () => mockNavigate,
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

const makeContext = (overrides = {}) => ({
  artworks: [],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  initSearch: mockInitSearch,
  loadMore: vi.fn(),
  abort: vi.fn(),
  totalCount: 0,
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

  it('renders result count when totalCount > 0', () => {
    useGridBrowse.mockReturnValue(makeContext({ totalCount: 42 }));
    render(<GridBrowse type="artist" />);
    expect(screen.getByText('42 artworks')).toBeTruthy();
  });

  it('does not render result count when totalCount is 0', () => {
    useGridBrowse.mockReturnValue(makeContext({ totalCount: 0 }));
    const { container } = render(<GridBrowse type="artist" />);
    expect(container.querySelector('.search-count')).toBeNull();
  });

  it('uses singular "artwork" when totalCount is 1', () => {
    useGridBrowse.mockReturnValue(makeContext({ totalCount: 1 }));
    render(<GridBrowse type="artist" />);
    expect(screen.getByText('1 artwork')).toBeTruthy();
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
