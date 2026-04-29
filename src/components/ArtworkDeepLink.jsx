import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchArtworkByID } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';
import { useArtworkModal } from '../context/ArtworkModalContext';
import flyingMachineIcon from '../assets/FlyingMachine2_tinted_gold.png';
import LoadingSpinner from './common/LoadingSpinner';
import './ArtworkDeepLink.css';

export default function ArtworkDeepLink() {
  const { artworkId } = useParams();
  const navigate = useNavigate();
  const { openModal } = useArtworkModal();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!artworkId) {
      navigate('/');
      return;
    }

    const controller = new AbortController();

    fetchArtworkByID(Number(artworkId), controller.signal)
      .then(apiArtwork => {
        if (!apiArtwork) throw new Error('Artwork not found');
        const artwork = transformAPIToDisplay(apiArtwork);
        navigate('/');
        // Open modal after navigation settles
        setTimeout(() => openModal(artwork), 50);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Unable to load artwork');
      });

    return () => controller.abort();
  }, [artworkId, navigate, openModal]);

  if (error) {
    return (
      <div className="deep-link-error">
        <img src={flyingMachineIcon} alt="" className="deep-link-error-icon" />
        <p className="deep-link-error-title">Artwork not found</p>
        <p className="deep-link-error-detail">{error}</p>
        <button className="deep-link-retry-btn" onClick={() => navigate('/')}>
          Explore the collection
        </button>
      </div>
    );
  }

  return (
    <div className="deep-link-loading">
      <LoadingSpinner />
    </div>
  );
}
