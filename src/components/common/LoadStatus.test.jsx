import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoadStatus from './LoadStatus';

describe('LoadStatus', () => {
  it('renders nothing when there is neither a wait nor an error', () => {
    const { container } = render(<LoadStatus error={null} throttledUntil={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('a wait wins over an error: the countdown shows, the retry does not', () => {
    render(<LoadStatus error="Couldn't load" throttledUntil={Date.now() + 30000} onRetry={vi.fn()} />);
    expect(screen.getByRole('status').className).toBe('throttle-notice');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the full-screen error carries the title, the detail and a working retry', () => {
    const onRetry = vi.fn();
    const { container } = render(<LoadStatus error="Couldn't load" title="Unable to load liked artworks" onRetry={onRetry} />);
    expect(container.querySelector('.error-container')).toBeTruthy();
    expect(screen.getByText('Unable to load liked artworks')).toBeTruthy();
    expect(screen.getByText("Couldn't load")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('the inline form sits below results as a status line', () => {
    const { container } = render(<LoadStatus inline error="Couldn't load" onRetry={vi.fn()} />);
    expect(container.querySelector('.inline-error')).toBeTruthy();
    expect(container.querySelector('.error-container')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
