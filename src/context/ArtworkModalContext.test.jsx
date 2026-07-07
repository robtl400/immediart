/**
 * ArtworkModalContext tests
 *
 * The modal's open/closed state now lives in the URL. This context only caches
 * the artwork it was opened with and pushes/pops the /artwork/:id route.
 *
 * Pattern: mock react-router-dom's useNavigate to a spy, keep useLocation real
 * via a MemoryRouter so location.state (the "background" marker openModal sets)
 * behaves like the real router. `initialEntries` seeds whether the current
 * location was opened from a page (state.background present) or is a direct load.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ArtworkModalProvider, useArtworkModal } from './ArtworkModalContext';

const navigate = vi.fn();

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return { ...actual, useNavigate: () => navigate };
});

// Render the provider inside a MemoryRouter seeded at `entry`. useLocation reads
// the real router state; useNavigate is the spy above.
function makeWrapper(entry = '/') {
  return ({ children }) => (
    <MemoryRouter initialEntries={[entry]}>
      <ArtworkModalProvider>{children}</ArtworkModalProvider>
    </MemoryRouter>
  );
}

describe('ArtworkModalContext', () => {
  beforeEach(() => navigate.mockClear());

  it('openModal navigates to /artwork/:id with the current location as state.background', () => {
    const { result } = renderHook(() => useArtworkModal(), { wrapper: makeWrapper('/') });

    act(() => result.current.openModal({ id: 42, title: 'A' }));

    expect(navigate).toHaveBeenCalledTimes(1);
    const [path, opts] = navigate.mock.calls[0];
    expect(path).toBe('/artwork/42');
    // The background marker carries the page we opened from, so closing returns
    // to it and the page keeps rendering behind the modal.
    expect(opts.state.background).toBeTruthy();
    expect(opts.state.background.pathname).toBe('/');
  });

  it('openModal caches the artwork it was opened with', () => {
    const { result } = renderHook(() => useArtworkModal(), { wrapper: makeWrapper('/') });
    const artwork = { id: 7, title: 'Cached' };

    expect(result.current.cachedArtwork).toBeNull();
    act(() => result.current.openModal(artwork));
    expect(result.current.cachedArtwork).toBe(artwork);
  });

  it('closeModal from a background location pops back with navigate(-1)', () => {
    // Seed a location that carries a background marker — i.e. we arrived here by
    // opening the modal from a page.
    const wrapper = ({ children }) => (
      <MemoryRouter initialEntries={[{ pathname: '/artwork/1', state: { background: { pathname: '/' } } }]}>
        <ArtworkModalProvider>{children}</ArtworkModalProvider>
      </MemoryRouter>
    );
    const { result } = renderHook(() => useArtworkModal(), { wrapper });

    act(() => result.current.closeModal());

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('closeModal on a direct load (no background) replaces to the feed', () => {
    // A shared link / direct load has no background marker — closing must not
    // eject the visitor off-site, so it replaces to the feed.
    const { result } = renderHook(() => useArtworkModal(), {
      wrapper: makeWrapper('/artwork/1'),
    });

    act(() => result.current.closeModal());

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('useArtworkModal throws when used outside the provider', () => {
    // renderHook logs the thrown error via console.error — silence it
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useArtworkModal(), { wrapper: MemoryRouter })).toThrow(
      'useArtworkModal must be used within an ArtworkModalProvider'
    );
    spy.mockRestore();
  });
});
