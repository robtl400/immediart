import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GridHeader from './GridHeader';

const router = vi.hoisted(() => ({ navigate: vi.fn(), location: { key: 'abc', state: null } }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => router.navigate,
  useLocation: () => router.location,
}));
vi.mock('../common/Banner', () => ({ default: () => <div data-testid="banner" /> }));

describe('GridHeader', () => {
  beforeEach(() => { router.navigate.mockClear(); });

  it('shows the term and a back control that pops the history', () => {
    router.location = { key: 'abc', state: null };
    render(<GridHeader displayTerm="@van_gogh" />);
    expect(screen.getByText('@van_gogh').className).toBe('search-term');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(router.navigate).toHaveBeenCalledWith(-1);
  });

  it('a typed query renders in the sans-serif style', () => {
    render(<GridHeader displayTerm="“cats”" isQuery />);
    expect(screen.getByText('“cats”').className).toContain('search-term--query');
  });

  it('the back control goes home when the grid was opened in a fresh tab', () => {
    router.location = { key: 'default', state: null };
    render(<GridHeader displayTerm="Liked" />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(router.navigate).toHaveBeenCalledWith('/');
  });
});
