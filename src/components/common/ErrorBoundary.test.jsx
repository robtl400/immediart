/**
 * ErrorBoundary component tests
 *
 * Covers: fallback UI when a child throws (role=alert, page wrapper classes),
 * "Back to the feed" recovery via window.location.assign('/'), and normal
 * child rendering when nothing throws.
 *
 * Pattern: console.error silenced — React logs caught render errors loudly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Bomb() {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  let originalLocation;

  beforeEach(() => {
    // React + the boundary itself both log caught render errors
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // window.location.assign is not implemented in jsdom — replace location
    // with a stub object so handleReset can be observed
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">All good</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows role=alert fallback with "Something went wrong" when a child throws', () => {
    const { container } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    // Fallback is wrapped in the app-frame page shell
    expect(container.querySelector('.error-boundary-page.app-frame')).toBeTruthy();
  });

  it('"Back to the feed" navigates to / via window.location.assign', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /back to the feed/i }));
    expect(window.location.assign).toHaveBeenCalledWith('/');
  });
});
