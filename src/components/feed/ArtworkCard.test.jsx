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
  ...overrides,
});

describe('ArtworkCard — artist click', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('calls onArtistClick with artistName when provided', () => {
    const onArtistClick = vi.fn();
    render(<ArtworkCard artwork={makeArtwork()} isLiked={false} onLike={vi.fn()} onImageDoubleClick={vi.fn()} onArtistClick={onArtistClick} />);
    // Artist button renders with the username as text
    fireEvent.click(screen.getByRole('button', { name: /vangogh/i }));
    expect(onArtistClick).toHaveBeenCalledWith('Van Gogh');
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
    expect(onTagClick).toHaveBeenCalledWith('impressionism');
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
    expect(onArtistClick).toHaveBeenCalledWith('Van Gogh');
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
