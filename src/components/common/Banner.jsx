import { useNavigate, useLocation } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import { useArtworks } from '../../context/ArtworksContext';
import { useGridBrowse } from '../../context/GridBrowseContext';

/**
 * Shared Banner component
 * - On home page: clickable to refresh artworks and scroll to top
 * - On other pages: aborts grid requests and navigates home with refresh
 */
export default function Banner({ isScrolled = false, feedRef = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useArtworks();
  const { abort: abortGrid } = useGridBrowse();
  const isHome = location.pathname === '/';

  const handleClick = () => {
    if (isHome) {
      // On home: scroll to top and refresh artworks
      if (feedRef?.current) {
        feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      refresh();
    } else {
      // From other pages: abort grid requests, navigate home, then refresh
      abortGrid();
      navigate('/');
      // Refresh after navigation (delay allows navigation to complete)
      setTimeout(refresh, 100);
    }
  };

  return (
    <header
      className={`banner ${isScrolled || !isHome ? 'scrolled' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className="banner-content">
        <img src={flyingMachineIcon} alt="" className="banner-logo" />
        <h1 className="banner-title">ImmediArt</h1>
      </div>
    </header>
  );
}
