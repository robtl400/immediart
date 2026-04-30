import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArtistProfileHeader from './ArtistProfileHeader';

const makeArtwork = (overrides = {}) => ({
  artistBio: '',
  isHighlight: false,
  artistULAN_URL: '',
  objectURL: '',
  ...overrides,
});

describe('ArtistProfileHeader — username', () => {
  it('renders formatted username via formatArtistUsername', () => {
    const { container } = render(<ArtistProfileHeader artistName="Vincent van Gogh" artworks={[makeArtwork()]} />);
    expect(container.querySelector('.profile-username').textContent).toBe('@vincent_van_gogh');
  });

  it('renders display name as plain text', () => {
    render(<ArtistProfileHeader artistName="Vincent van Gogh" artworks={[makeArtwork()]} />);
    expect(screen.getByText('Vincent van Gogh')).toBeTruthy();
  });
});

describe('ArtistProfileHeader — bio', () => {
  it('renders bio when present', () => {
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={[makeArtwork({ artistBio: 'Dutch, 1853–1890' })]} />);
    expect(container.querySelector('.profile-bio').textContent).toBe('Dutch, 1853–1890');
  });

  it('omits bio element when absent', () => {
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={[makeArtwork()]} />);
    expect(container.querySelector('.profile-bio')).toBeNull();
  });

  it('omits bio element when whitespace-only', () => {
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={[makeArtwork({ artistBio: '   ' })]} />);
    expect(container.querySelector('.profile-bio')).toBeNull();
  });

  it('uses the first artwork with a non-empty bio, not artworks[0]', () => {
    const artworks = [
      makeArtwork({ artistBio: '' }),
      makeArtwork({ artistBio: 'Dutch, 1853–1890' }),
    ];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    expect(container.querySelector('.profile-bio').textContent).toBe('Dutch, 1853–1890');
  });
});

describe('ArtistProfileHeader — link in bio', () => {
  it('prefers artistULAN_URL over objectURL', () => {
    const artworks = [makeArtwork({ artistULAN_URL: 'https://ulan.example.com/123', objectURL: 'https://met.org/1' })];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    expect(container.querySelector('.profile-link-in-bio').href).toContain('ulan.example.com');
  });

  it('finds ULAN from a different artwork than the bio artwork', () => {
    const artworks = [
      makeArtwork({ artistBio: 'Dutch, 1853–1890', artistULAN_URL: '' }),
      makeArtwork({ artistBio: '', artistULAN_URL: 'https://ulan.example.com/123' }),
    ];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    expect(container.querySelector('.profile-link-in-bio').href).toContain('ulan.example.com');
  });

  it('falls back to objectURL when no ULAN', () => {
    const artworks = [makeArtwork({ artistBio: 'Dutch', objectURL: 'https://met.org/1' })];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    expect(container.querySelector('.profile-link-in-bio').href).toContain('met.org');
  });

  it('falls back to MET search URL when neither ULAN nor objectURL present', () => {
    const artworks = [makeArtwork()];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    expect(container.querySelector('.profile-link-in-bio').href).toContain('metmuseum.org/search-results');
    expect(container.querySelector('.profile-link-in-bio').href).toContain('Van%20Gogh');
  });
});

describe('ArtistProfileHeader — verified badge and highlights', () => {
  it('shows verified badge when at least one artwork isHighlight', () => {
    const artworks = [makeArtwork({ isHighlight: true }), makeArtwork()];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    expect(container.querySelector('.profile-verified')).toBeTruthy();
  });

  it('shows highlight stat when highlights present', () => {
    const artworks = [makeArtwork({ isHighlight: true }), makeArtwork()];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    const stats = container.querySelectorAll('.profile-stat');
    const highlightStat = Array.from(stats).find(s => s.textContent.includes('highlight'));
    expect(highlightStat).toBeTruthy();
    expect(highlightStat.querySelector('strong').textContent).toBe('1');
  });

  it('omits verified badge and highlight stat when no highlights', () => {
    const artworks = [makeArtwork(), makeArtwork()];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    expect(container.querySelector('.profile-verified')).toBeNull();
    const stats = Array.from(container.querySelectorAll('.profile-stat'));
    expect(stats.some(s => s.textContent.includes('highlight'))).toBe(false);
  });

  it('uses plural "highlights" for count > 1', () => {
    const artworks = [makeArtwork({ isHighlight: true }), makeArtwork({ isHighlight: true })];
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={artworks} />);
    const stats = Array.from(container.querySelectorAll('.profile-stat'));
    const highlightStat = stats.find(s => s.textContent.includes('highlight'));
    expect(highlightStat.textContent).toContain('highlights');
    expect(highlightStat.querySelector('strong').textContent).toBe('2');
  });
});

describe('ArtistProfileHeader — artwork count', () => {
  it('shows singular "artwork" for one artwork', () => {
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={[makeArtwork()]} />);
    const countStat = container.querySelector('.profile-stat');
    expect(countStat.textContent).toContain('loaded');
    expect(countStat.querySelector('strong').textContent).toBe('1');
    expect(countStat.textContent).not.toContain('artworks');
  });

  it('shows plural "artworks" for multiple artworks', () => {
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={[makeArtwork(), makeArtwork()]} />);
    const countStat = container.querySelector('.profile-stat');
    expect(countStat.querySelector('strong').textContent).toBe('2');
    expect(countStat.textContent).toContain('artworks');
  });

  it('renders without crashing for empty artworks array', () => {
    const { container } = render(<ArtistProfileHeader artistName="Van Gogh" artworks={[]} />);
    expect(container.querySelector('.artist-profile-header')).toBeTruthy();
    const countStat = container.querySelector('.profile-stat');
    expect(countStat.querySelector('strong').textContent).toBe('0');
  });
});
