/**
 * BannerSearch — the full-width banner search input.
 *
 * Covers: prefill from the current /search URL, Enter → navigate to
 * /search/:encoded + close, empty submit is a no-op, Escape closes, back button
 * closes, and an outside pointerdown collapses the field.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import BannerSearch from './BannerSearch';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function setup(onClose = vi.fn(), initialPath = '/') {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BannerSearch onClose={onClose} />
      <LocationProbe />
    </MemoryRouter>
  );
  return { onClose, input: screen.getByRole('searchbox'), loc: () => screen.getByTestId('loc').textContent };
}

describe('BannerSearch', () => {
  it('autofocuses the input on mount', () => {
    const { input } = setup();
    expect(document.activeElement).toBe(input);
  });

  it('prefills with the current query on a /search page', () => {
    const { input } = setup(vi.fn(), '/search/claude%20monet');
    expect(input.value).toBe('claude monet');
  });

  it('starts empty off a search page', () => {
    const { input } = setup(vi.fn(), '/');
    expect(input.value).toBe('');
  });

  it('Enter navigates to /search/:encoded and closes without refocus', () => {
    const { onClose, input, loc } = setup();
    fireEvent.change(input, { target: { value: 'sun flowers' } });
    fireEvent.submit(input.closest('form'));
    expect(loc()).toBe('/search/sun%20flowers');
    expect(onClose).toHaveBeenCalledWith({ refocus: false });
  });

  it('empty / whitespace submit is a no-op (no navigation, no close)', () => {
    const { onClose, input, loc } = setup();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form'));
    expect(loc()).toBe('/');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes the field', () => {
    const { onClose, input } = setup();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the back chevron closes the field', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: /close search/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a tap outside the field collapses it', () => {
    const { onClose } = setup();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('a tap inside the field does not collapse it', () => {
    const { onClose, input } = setup();
    fireEvent.pointerDown(input);
    expect(onClose).not.toHaveBeenCalled();
  });
});
