/**
 * ArtworkModal component tests
 *
 * The modal now mounts as the /artwork/:id route (mount === open — there is no
 * isOpen guard and no "renders nothing when closed"). It reads artworkId from
 * useParams, renders instantly from the cached artwork when the ids match, and
 * otherwise fetches by id. These tests supply a matching cachedArtwork so the
 * component renders synchronously without hitting the network.
 *
 * Covers: dialog ARIA, close button + backdrop close (with card stopPropagation),
 * image error fallback + keyed reset, the like/share action row, and the
 * clickable Artist metadata value navigating to the artist page.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArtworkModal from './ArtworkModal';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));
vi.mock('../common/Banner', () => ({ default: () => <div data-testid="banner" /> }));

const mockNavigate = vi.fn();

// Route params drive which artwork the modal renders; useNavigate is spied so the
// Artist-link test can assert navigation. Other exports (Link etc.) are unused.
vi.mock('react-router-dom', () => ({
  useParams: () => ({ artworkId: '1' }),
  useNavigate: () => mockNavigate,
}));

const mockCloseModal = vi.fn();
const mockToggleLike = vi.fn();
const mockShare = vi.fn();

vi.mock('../../context/ArtworkModalContext', () => ({
  useArtworkModal: vi.fn(),
}));
vi.mock('../../context/LikesContext', () => ({
  useLikes: vi.fn(),
}));
vi.mock('../../hooks/useShareArtwork', () => ({
  useShareArtwork: vi.fn(),
}));
// If the cached artwork matches the route id the modal never fetches; the mock
// keeps a stray fetch from hitting the real network if that ever changes.
vi.mock('../../services/metAPI', () => ({
  fetchArtworkByID: vi.fn().mockResolvedValue(null),
}));

import { useArtworkModal } from '../../context/ArtworkModalContext';
import { useLikes } from '../../context/LikesContext';
import { useShareArtwork } from '../../hooks/useShareArtwork';

const makeArtwork = (overrides = {}) => ({
  id: 1,
  title: 'Starry Night',
  artistName: 'Van Gogh',
  primaryImageFull: 'https://example.com/full.jpg',
  imageUrl: 'https://example.com/img.jpg',
  date: '1889',
  medium: 'Oil on canvas',
  dimensions: '73.7 × 92.1 cm',
  culture: null,
  period: null,
  dynasty: null,
  portfolio: null,
  city: null,
  state: null,
  country: null,
  department: 'Modern Art',
  gallery: null,
  creditLine: null,
  ...overrides,
});

// Wire the mocked hooks. cachedArtwork.id must equal Number(artworkId) === 1 so
// the modal renders from cache (no fetch, no loading state).
function setup({ artwork = makeArtwork(), liked = false } = {}) {
  useArtworkModal.mockReturnValue({ cachedArtwork: artwork, closeModal: mockCloseModal });
  useLikes.mockReturnValue({ isLiked: () => liked, toggleLike: mockToggleLike });
  useShareArtwork.mockReturnValue({ copied: false, share: mockShare });
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockCloseModal.mockClear();
  mockToggleLike.mockClear();
  mockShare.mockClear();
});

describe('ArtworkModal — ARIA', () => {
  it('renders a dialog with role="dialog" and aria-modal="true"', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    const backdrop = container.querySelector('.artwork-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop.getAttribute('role')).toBe('dialog');
    expect(backdrop.getAttribute('aria-modal')).toBe('true');
  });
});

describe('ArtworkModal — close button', () => {
  it('renders the close button', () => {
    setup();
    render(<ArtworkModal />);
    expect(screen.getByRole('button', { name: /close artwork details/i })).toBeTruthy();
  });

  it('clicking the close button calls closeModal', () => {
    setup();
    render(<ArtworkModal />);
    fireEvent.click(screen.getByRole('button', { name: /close artwork details/i }));
    expect(mockCloseModal).toHaveBeenCalled();
  });
});

describe('ArtworkModal — click-through', () => {
  it('clicking the backdrop calls closeModal', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    fireEvent.click(container.querySelector('.artwork-modal-backdrop'));
    expect(mockCloseModal).toHaveBeenCalled();
  });

  it('clicking the modal card does NOT call closeModal (stopPropagation)', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    fireEvent.click(container.querySelector('.artwork-modal-card'));
    expect(mockCloseModal).not.toHaveBeenCalled();
  });
});

describe('ArtworkModal — actions', () => {
  it('the like button fires toggleLike with the artwork id', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    fireEvent.click(container.querySelector('.artwork-modal-actions .like-btn'));
    expect(mockToggleLike).toHaveBeenCalledWith(1);
  });

  it('the share button fires share with the artwork', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    fireEvent.click(container.querySelector('.artwork-modal-actions .share-btn'));
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('reflects liked state on the like button', () => {
    setup({ liked: true });
    const { container } = render(<ArtworkModal />);
    expect(container.querySelector('.like-btn.liked')).toBeTruthy();
  });
});

describe('ArtworkModal — artist link', () => {
  it('the Artist metadata value is clickable and navigates to the artist page', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    const clickable = container.querySelector('.metadata-value.clickable');
    expect(clickable).toBeTruthy();
    expect(clickable.textContent).toBe('Van Gogh');
    fireEvent.click(clickable);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/artist/Van%20Gogh',
      { state: { seedArtworks: [expect.objectContaining({ id: 1 })] } }
    );
  });
});

describe('ArtworkModal — image error fallback', () => {
  it('shows the fallback when the image fires onError', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    fireEvent.error(container.querySelector('.artwork-modal-image'));
    expect(container.querySelector('.modal-image-fallback')).toBeTruthy();
    expect(screen.getByText('Image unavailable')).toBeTruthy();
  });

  it('renders the image from the cached artwork before any error', () => {
    // The image starts in the non-error state, sourced from the cached artwork.
    setup({ artwork: makeArtwork({ primaryImageFull: 'https://example.com/full.jpg' }) });
    const { container } = render(<ArtworkModal />);
    expect(container.querySelector('.modal-image-fallback')).toBeNull();
    const img = container.querySelector('.artwork-modal-image');
    expect(img).toBeTruthy();
    expect(img.src).toBe('https://example.com/full.jpg');
  });
});

describe('ArtworkModal — image source (carousel slide)', () => {
  it('prefers viewImageUrl (the slide the carousel opened on) over the primary', () => {
    setup({ artwork: makeArtwork({ viewImageUrl: 'https://example.com/slide-3.jpg' }) });
    const { container } = render(<ArtworkModal />);
    expect(container.querySelector('.artwork-modal-image').src).toBe('https://example.com/slide-3.jpg');
  });

  it('falls back to primaryImageFull when there is no viewImageUrl', () => {
    setup({ artwork: makeArtwork() });
    const { container } = render(<ArtworkModal />);
    expect(container.querySelector('.artwork-modal-image').src).toBe('https://example.com/full.jpg');
  });

  it('the image sits inside a focusable zoom viewport', () => {
    setup();
    const { container } = render(<ArtworkModal />);
    const viewport = container.querySelector('.zoom-viewport');
    expect(viewport).toBeTruthy();
    expect(viewport.getAttribute('tabIndex')).toBe('0');
    expect(viewport.contains(container.querySelector('.artwork-modal-image'))).toBe(true);
  });
});
