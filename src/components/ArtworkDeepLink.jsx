import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchArtworkByID } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';
import { useArtworkModal } from '../context/ArtworkModalContext';
import flyingMachineIcon from '../assets/FlyingMachine2_tinted_gold.png';
import LoadingSpinner from './common/LoadingSpinner';

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
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', gap: '16px',
        background: '#121212', color: '#888', textAlign: 'center', padding: '20px'
      }}>
        <img src={flyingMachineIcon} alt="" style={{ width: 64, height: 64, opacity: 0.5 }} />
        <p style={{ color: '#F0B900', fontWeight: 600 }}>Artwork not found</p>
        <p style={{ fontSize: 14 }}>{error}</p>
        <button
          onClick={() => navigate('/')}
          style={{
            background: '#F0B900', color: '#121212', border: 'none',
            padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer'
          }}
        >
          Explore the collection
        </button>
      </div>
    );
  }

  // Loading state — flying machine sweep
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      background: '#121212'
    }}>
      <LoadingSpinner />
    </div>
  );
}
