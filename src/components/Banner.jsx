import { useNavigate, useLocation } from 'react-router-dom';
import flyingMachineIcon from '../assets/FlyingMachine2.png';

/**
 * Shared Banner component
 * - On home page: displays full banner with scroll animation
 * - On other pages: displays compact banner, clickable to go home
 */
export default function Banner({ isScrolled = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const handleClick = () => {
    if (!isHome) {
      navigate('/');
    }
  };

  return (
    <header
      className={`banner ${isScrolled || !isHome ? 'scrolled' : ''}`}
      onClick={handleClick}
      style={{ cursor: isHome ? 'default' : 'pointer' }}
      role={isHome ? undefined : 'button'}
      tabIndex={isHome ? undefined : 0}
      onKeyDown={(e) => !isHome && e.key === 'Enter' && handleClick()}
    >
      <div className="banner-content">
        <img src={flyingMachineIcon} alt="" className="banner-logo" />
        <h1 className="banner-title">ImmediArt</h1>
      </div>
    </header>
  );
}
