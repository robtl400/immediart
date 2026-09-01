import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ThrottleNotice from './ThrottleNotice';

describe('ThrottleNotice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down whole seconds visually while the announced sentence stays constant', () => {
    const { container } = render(<ThrottleNotice until={Date.now() + 5000} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/resuming shortly \(5s\)/);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(status.textContent).toMatch(/\(4s\)/);
    // The number is hidden from assistive tech so the status is read once
    expect(container.querySelector('[aria-hidden="true"]').textContent).toBe(' (4s)');
  });

  it('never shows 0s — the retry fires just after the countdown', () => {
    render(<ThrottleNotice until={Date.now() - 500} />);
    expect(screen.getByRole('status').textContent).toMatch(/\(1s\)/);
  });
});
