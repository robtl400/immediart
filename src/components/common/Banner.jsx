import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import { useArtworks } from '../../context/ArtworksContext';
import { useGridBrowse } from '../../context/GridBrowseContext';
import BannerActions from './BannerActions';
import BannerSearch from './BannerSearch';

/**
 * Shared Banner.
 * - The logo/title is the home/refresh control (a real <button>, so Enter/Space
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
  const { refresh } = useArtworks();
  const { abort: abortGrid } = useGridBrowse();
  const isHome = location.pathname === '/';

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
      if (feedRef?.current) feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      refresh();
    } else {
      abortGrid();
      navigate('/');
      // Refresh after navigation settles.
      setTimeout(refresh, 100);
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
