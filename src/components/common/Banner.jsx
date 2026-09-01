import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import { useArtworks } from '../../context/ArtworksContext';
import { useGridBrowse } from '../../context/GridBrowseContext';
import BannerActions from './BannerActions';
import BannerSearch from './BannerSearch';
import { scrollBehavior } from '../../utils/motion';

// Taps on the logo closer together than this reshuffle once: every reshuffle
// spends a fresh initial batch and prefetch out of the shared request budget.
const REFRESH_MIN_GAP_MS = 3000;

/**
 * Shared Banner.
 * - The logo/title is the home control — on the feed it scrolls to the top and
 *   reshuffles; anywhere else it just navigates home (a real <button>, so Enter/Space
 *   work natively) — only that region is clickable, not the whole header, so the
 *   right-aligned action cluster can nest without invalid nested interactives.
 * - `showActions` (default true) renders the search + likes cluster; the modal
 *   passes false (a static, action-free masthead). The 404 keeps the cluster so
 *   a lost visitor can still search or reach their likes.
 * - `interactive` (default true) makes the logo a nav button; the modal passes
 *   false so its masthead is static (tapping it must not close the modal +
 *   reshuffle the feed behind a share recipient).
 */
export default function Banner({ isScrolled = false, feedRef = null, showActions = true, interactive = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, loading } = useArtworks();
  const { abort: abortGrid } = useGridBrowse();
  const isHome = location.pathname === '/';
  const lastRefreshRef = useRef(0);

  // Search open/closed lives here (not in BannerActions) so the expanded input
  // can take over the full masthead. Closing restores focus to the magnifier
  // toggle unless we're navigating away on submit.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggleRef = useRef(null);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(({ refocus = true } = {}) => {
    setSearchOpen(false);
    if (refocus) searchToggleRef.current?.focus();
  }, []);

  const handleLogoClick = () => {
    if (isHome) {
      feedRef?.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
      // A reshuffle while the first batch is still loading, or hard on the
      // heels of the last one, would only abort in-flight requests whose
      // tokens are already spent.
      const now = Date.now();
      if (loading || now - lastRefreshRef.current < REFRESH_MIN_GAP_MS) return;
      lastRefreshRef.current = now;
      refresh();
    } else {
      // Going home from a grid is free: the feed is still mounted in its
      // provider and restores its scroll position on its own.
      abortGrid();
      navigate('/');
    }
  };

  const logo = (
    <div className="banner-content">
      <img src={flyingMachineIcon} alt="" className="banner-logo" />
      <h1 className="banner-title">ImmediArt</h1>
    </div>
  );

  return (
    <header className={`banner ${isScrolled || !isHome ? 'scrolled' : ''}`}>
      {interactive ? (
        <button type="button" className="banner-logo-btn" onClick={handleLogoClick} aria-label="Home">
          {logo}
        </button>
      ) : (
        logo
      )}
      {showActions && <BannerActions onOpenSearch={openSearch} toggleRef={searchToggleRef} searchOpen={searchOpen} />}
      {showActions && searchOpen && <BannerSearch onClose={closeSearch} />}
    </header>
  );
}
