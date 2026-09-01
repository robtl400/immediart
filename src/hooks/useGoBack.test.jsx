import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useGoBack from './useGoBack';

const router = vi.hoisted(() => ({ navigate: vi.fn(), location: { key: 'abc', state: null } }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => router.navigate,
  useLocation: () => router.location,
}));

describe('useGoBack', () => {
  beforeEach(() => { router.navigate.mockClear(); });

  it('goes back when there is a page to go back to', () => {
    router.location = { key: 'abc', state: null };
    const { result } = renderHook(() => useGoBack());
    result.current();
    expect(router.navigate).toHaveBeenCalledWith(-1);
  });

  it('goes home from a fresh tab (a shared link), which has no page behind it', () => {
    router.location = { key: 'default', state: null };
    const { result } = renderHook(() => useGoBack());
    result.current();
    expect(router.navigate).toHaveBeenCalledWith('/');
  });
});
