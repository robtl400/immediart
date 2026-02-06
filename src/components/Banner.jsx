import { useNavigate, useLocation } from 'react-router-dom';
import flyingMachineIcon from '../assets/FlyingMachine2.png';
import { useArtworks } from '../context/ArtworksContext';

/**
 * Shared Banner component
 * - On home page: clickable to refresh artworks and scroll to top
 * - On other pages: displays compact banner, clickable to go home
 */
export default function Banner({ isScrolled = false, feedRef = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useArtworks();
  const isHome = location.pathname === '/';

  const handleClick = () => {
    if (isHome) {
      // Scroll to top and refresh artworks
      if (feedRef?.current) {
        feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    // Always refresh artworks when banner is clicked
    refresh();
    if (!isHome) {
      navigate('/');
    }
  };

  return (
    <header
      className={`banner ${isScrolled || !isHome ? 'scrolled' : ''}`}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
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
