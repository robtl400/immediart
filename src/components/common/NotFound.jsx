import { useNavigate } from 'react-router-dom';
import Banner from './Banner';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="not-found-page app-frame">
      <Banner isScrolled={true} />
      <div className="not-found-content">
        <p className="not-found-text">Page not found</p>
        <button className="empty-state-cta" onClick={() => navigate('/')}>
          Explore the collection
        </button>
      </div>
    </div>
  );
}
