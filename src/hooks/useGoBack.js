import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// The back control on a page that may have been opened directly: a shared
// link in a fresh tab has no page to go back to, so it goes home instead.
export default function useGoBack() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    () => (location.key === 'default' ? navigate('/') : navigate(-1)),
    [navigate, location.key]
  );
}
