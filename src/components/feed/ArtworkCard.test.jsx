/**
 * ArtworkCard component tests
 *
 * Covers: prop-based navigation callbacks (onArtistClick / onTagClick),
 * anonymous artist guard (no artistName → no callback), fallback to
 * useNavigate when callbacks are omitted, like/unlike toggle rendering.
 *
 * Pattern: vi.mock react-router-dom navigate; render via @testing-library/react.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArtworkCard from './ArtworkCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../assets/FlyingMachine2_tinted_gold.png', () => ({ default: 'icon.png' }));

const makeArtwork = (overrides = {}) => ({
  id: 1,
  title: 'Starry Night',
  artistName: 'Van Gogh',
  username: 'vangogh',
  description: 'A swirling night sky',
  imageUrl: 'https://example.com/img.jpg',
  tags: ['impressionism', 'night'],
  date: '1889',
  comments: [],
  gallery: null,
  city: '',
  country: '',
  isHighlight: false,
  artistBio: '',
  creditLine: '',
  accessionYear: '',
  objectURL: '',
  additionalImages: [],
  artistULAN_URL: '',
  ...overrides,
});

describe('ArtworkCard — artist click', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('calls onArtistClick with artistName when provided', () => {
    const onArtistClick = vi.fn();
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onArtistClick={onArtistClick} />);
    // Artist button renders with the username as text
    fireEvent.click(screen.getByRole('button', { name: /vangogh/i }));
    expect(onArtistClick).toHaveBeenCalledWith('Van Gogh', expect.objectContaining({ id: 1 }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to navigate when onArtistClick is not provided', () => {
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /vangogh/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/artist/Van%20Gogh');
  });

  it('does not render a clickable artist button for anonymous works', () => {
    const onArtistClick = vi.fn();
    render(<ArtworkCard artwork={makeArtwork({ artistName: '', username: 'anonymous' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onArtistClick={onArtistClick} />);
    // No artist button — the span has no role=button for anonymous works
    expect(screen.queryByRole('button', { name: /anonymous/i })).toBeNull();
    expect(onArtistClick).not.toHaveBeenCalled();
  });
});

describe('ArtworkCard — tag click', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('calls onTagClick with tag when provided', () => {
    const onTagClick = vi.fn();
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onTagClick={onTagClick} />);
    fireEvent.click(screen.getByRole('button', { name: /#impressionism/i }));
    expect(onTagClick).toHaveBeenCalledWith('impressionism', expect.objectContaining({ id: 1 }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to navigate when onTagClick is not provided', () => {
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /#impressionism/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/tag/impressionism');
  });
});

describe('ArtworkCard — hover prefetch props', () => {
  it('calls onArtistHover on mouseenter when artist exists', () => {
    const onArtistHover = vi.fn();
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onArtistHover={onArtistHover} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /vangogh/i }));
    expect(onArtistHover).toHaveBeenCalledWith('Van Gogh');
  });

  it('calls onTagHover on mouseenter', () => {
    const onTagHover = vi.fn();
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onTagHover={onTagHover} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /#impressionism/i }));
    expect(onTagHover).toHaveBeenCalledWith('impressionism');
  });

  it('does not call onArtistHover for anonymous artwork (no artistName)', () => {
    const onArtistHover = vi.fn();
    render(<ArtworkCard artwork={makeArtwork({ artistName: '', username: 'anonymous' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onArtistHover={onArtistHover} />);
    // No artist button rendered for anonymous works — onArtistHover can never fire
    expect(screen.queryByRole('button', { name: /anonymous/i })).toBeNull();
    expect(onArtistHover).not.toHaveBeenCalled();
  });

  it('onArtistClick still fires on click when onArtistHover also wired — regression guard', () => {
    const onArtistClick = vi.fn();
    const onArtistHover = vi.fn();
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onArtistClick={onArtistClick} onArtistHover={onArtistHover} />);
    fireEvent.click(screen.getByRole('button', { name: /vangogh/i }));
    expect(onArtistClick).toHaveBeenCalledWith('Van Gogh', expect.objectContaining({ id: 1 }));
  });
});

describe('ArtworkCard — image placeholder (T1-A)', () => {
  it('image placeholder stays in DOM after image load (unconditional render)', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    const img = container.querySelector('.artwork-image');
    fireEvent.load(img);
    expect(container.querySelector('.image-placeholder')).toBeTruthy();
  });

  it('image placeholder has loaded class after image load', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    const img = container.querySelector('.artwork-image');
    fireEvent.load(img);
    expect(container.querySelector('.image-placeholder.loaded')).toBeTruthy();
  });

  it('image placeholder has no loaded class before image load', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.image-placeholder.loaded')).toBeNull();
    expect(container.querySelector('.image-placeholder')).toBeTruthy();
  });

  it('image is clickable (onImageDoubleClick fires) after image load — pointer-events:none regression', () => {
    const onImageDoubleClick = vi.fn();
    const { container } = render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={onImageDoubleClick} />);
    const img = container.querySelector('.artwork-image');
    fireEvent.load(img);
    fireEvent.click(img);
    expect(onImageDoubleClick).toHaveBeenCalled();
  });
});

describe('ArtworkCard — description period (T1-B)', () => {
  it('description with content renders trailing period', () => {
    render(<ArtworkCard artwork={makeArtwork({ description: 'Oil on canvas' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(screen.getByText(/Oil on canvas\./)).toBeTruthy();
  });

  it('empty description renders no trailing period', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ description: '' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    const desc = container.querySelector('.artwork-description');
    expect(desc.textContent).not.toMatch(/^\./);
    expect(desc.textContent).not.toContain('.');
  });
});

describe('ArtworkCard — like state', () => {
  it('renders Like aria-label when not liked', () => {
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(screen.getByLabelText('Like')).toBeTruthy();
  });

  it('renders Unlike aria-label when liked', () => {
    render(<ArtworkCard artwork={makeArtwork()} isLiked={true} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(screen.getByLabelText('Unlike')).toBeTruthy();
  });
});

describe('ArtworkCard — post meta bar', () => {
  it('renders post-meta-bar with gallery number when gallery present', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ gallery: '634' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.post-meta-bar')).toBeTruthy();
    expect(container.querySelector('.post-location').textContent).toContain('Gallery 634');
  });

  it('renders city/country as plain text in post-location when no gallery', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ city: 'Paris', country: 'France' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.post-meta-bar')).toBeTruthy();
    expect(container.querySelector('.post-location').textContent).toContain('Paris, France');
  });

  it('renders city-only with no trailing comma when country absent', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ city: 'Paris', country: '' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.post-location').textContent).toContain('Paris');
    expect(container.querySelector('.post-location').textContent).not.toContain(',');
  });

  it('renders no meta-left when date, gallery, and city are all absent', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ date: '' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.meta-left')).toBeNull();
  });

  it('renders no post-location when city is whitespace-only', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ city: '   ', date: '' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.post-location')).toBeNull();
  });
});

describe('ArtworkCard — verified badge', () => {
  it('renders verified badge when isHighlight is true', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ isHighlight: true })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.verified-badge')).toBeTruthy();
  });

  it('does not render verified badge when isHighlight is false', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ isHighlight: false })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.verified-badge')).toBeNull();
  });
});


describe('ArtworkCard — sponsored post', () => {
  it('renders sponsored post when creditLine is present', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ creditLine: 'Purchase, Mr. Fund, 1955' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.sponsored-post')).toBeTruthy();
    expect(container.querySelector('.sponsored-label').textContent).toBe('Sponsored');
    expect(container.querySelector('.sponsor-name').textContent).toBe('Purchase, Mr. Fund, 1955');
  });

  it('does not render sponsored post when creditLine is absent', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ creditLine: '' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.sponsored-post')).toBeNull();
  });

  it('renders accessionYear when present in sponsored post', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ creditLine: 'Gift, 1920', accessionYear: '1920' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.acquired-date').textContent).toBe('Acquired 1920');
  });

  it('renders View Acquisition link when objectURL present', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ creditLine: 'Gift', objectURL: 'https://met.org/1' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    const link = container.querySelector('.view-acquisition');
    expect(link).toBeTruthy();
    expect(link.href).toBe('https://met.org/1');
  });

  it('does not render View Acquisition link when objectURL absent', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ creditLine: 'Gift', objectURL: '' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.view-acquisition')).toBeNull();
  });

  it('does not render sponsored post when creditLine is whitespace-only', () => {
    const { container } = render(<ArtworkCard artwork={makeArtwork({ creditLine: '   ' })} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} />);
    expect(container.querySelector('.sponsored-post')).toBeNull();
  });
});
