/**
 * ArtworkModal component tests
 *
 * Covers: close button, click-through bug (stopPropagation), ARIA attributes,
 * image error fallback.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArtworkModal from './ArtworkModal';

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));
vi.mock('../common/Banner', () => ({ default: () => <div data-testid="banner" /> }));

const mockCloseModal = vi.fn();

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

vi.mock('../../context/ArtworkModalContext', () => ({
  useArtworkModal: vi.fn(),
}));

import { useArtworkModal } from '../../context/ArtworkModalContext';

describe('ArtworkModal — close button', () => {
  beforeEach(() => mockCloseModal.mockClear());

  it('renders close button when modal is open', () => {
    useArtworkModal.mockReturnValue({ selectedArtwork: makeArtwork(), isOpen: true, closeModal: mockCloseModal });
    render(<ArtworkModal />);
    expect(screen.getByRole('button', { name: /close artwork details/i })).toBeTruthy();
  });

  it('clicking close button calls closeModal', () => {
    useArtworkModal.mockReturnValue({ selectedArtwork: makeArtwork(), isOpen: true, closeModal: mockCloseModal });
    render(<ArtworkModal />);
    fireEvent.click(screen.getByRole('button', { name: /close artwork details/i }));
    expect(mockCloseModal).toHaveBeenCalled();
  });
});

describe('ArtworkModal — click-through', () => {
  beforeEach(() => mockCloseModal.mockClear());

  it('clicking backdrop calls closeModal', () => {
    useArtworkModal.mockReturnValue({ selectedArtwork: makeArtwork(), isOpen: true, closeModal: mockCloseModal });
    const { container } = render(<ArtworkModal />);
    const backdrop = container.querySelector('.artwork-modal-backdrop');
    fireEvent.click(backdrop);
    expect(mockCloseModal).toHaveBeenCalled();
  });

  it('clicking modal card does NOT call closeModal (stopPropagation)', () => {
    useArtworkModal.mockReturnValue({ selectedArtwork: makeArtwork(), isOpen: true, closeModal: mockCloseModal });
    const { container } = render(<ArtworkModal />);
    const card = container.querySelector('.artwork-modal-card');
    fireEvent.click(card);
    expect(mockCloseModal).not.toHaveBeenCalled();
  });
});

describe('ArtworkModal — ARIA', () => {
  it('has role="dialog" and aria-modal="true" when open', () => {
    useArtworkModal.mockReturnValue({ selectedArtwork: makeArtwork(), isOpen: true, closeModal: mockCloseModal });
    const { container } = render(<ArtworkModal />);
    const backdrop = container.querySelector('.artwork-modal-backdrop');
    expect(backdrop.getAttribute('role')).toBe('dialog');
    expect(backdrop.getAttribute('aria-modal')).toBe('true');
  });

  it('renders nothing when closed', () => {
    useArtworkModal.mockReturnValue({ selectedArtwork: null, isOpen: false, closeModal: mockCloseModal });
    const { container } = render(<ArtworkModal />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ArtworkModal — image error fallback', () => {
  beforeEach(() => mockCloseModal.mockClear());

  it('shows fallback when image fires onError', () => {
    useArtworkModal.mockReturnValue({ selectedArtwork: makeArtwork(), isOpen: true, closeModal: mockCloseModal });
    const { container } = render(<ArtworkModal />);
    const img = container.querySelector('.artwork-modal-image');
    fireEvent.error(img);
    expect(screen.getByText('Image unavailable')).toBeTruthy();
  });
});
