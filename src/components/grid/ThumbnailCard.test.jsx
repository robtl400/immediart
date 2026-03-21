/**
 * ThumbnailCard component tests
 *
 * Covers: alt text for named artworks, alt text for anonymous artworks.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ThumbnailCard from './ThumbnailCard';

describe('ThumbnailCard — alt text', () => {
  it('includes artist name when artistName is non-empty', () => {
    const artwork = { title: 'Starry Night', artistName: 'Van Gogh', imageUrl: 'https://x.com/1.jpg' };
    const { getByRole } = render(<ThumbnailCard artwork={artwork} onClick={() => {}} />);
    const img = getByRole('img');
    expect(img.alt).toBe('Starry Night by Van Gogh');
  });

  it('uses title only when artistName is empty string', () => {
    const artwork = { title: 'Untitled', artistName: '', imageUrl: 'https://x.com/2.jpg' };
    const { getByRole } = render(<ThumbnailCard artwork={artwork} onClick={() => {}} />);
    const img = getByRole('img');
    expect(img.alt).toBe('Untitled');
  });

  it('uses title only when artistName is undefined', () => {
    const artwork = { title: 'Unknown Work', artistName: undefined, imageUrl: 'https://x.com/3.jpg' };
    const { getByRole } = render(<ThumbnailCard artwork={artwork} onClick={() => {}} />);
    const img = getByRole('img');
    expect(img.alt).toBe('Unknown Work');
  });
});
