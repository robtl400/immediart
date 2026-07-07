import { useNavigate, useLocation } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import { useArtworks } from '../../context/ArtworksContext';
import { useGridBrowse } from '../../context/GridBrowseContext';
import BannerActions from './BannerActions';

/**
 * Shared Banner.
 * - The logo/title is the home/refresh control (a real <button>, so Enter/Space
 *   work natively) — only that region is clickable, not the whole header, so the
 *   right-aligned action cluster can nest without invalid nested interactives.
 * - `showActions` (default true) renders the likes cluster; the modal and 404
 *   pass false.
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
      {showActions && <BannerActions />}
    </header>
  );
}
