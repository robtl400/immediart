import { useEffect, useCallback } from 'react';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import Banner from '../common/Banner';
import './ArtworkModal.css';

export default function ArtworkModal() {
  const { selectedArtwork, isOpen, closeModal } = useArtworkModal();

  // Handle ESC key to close
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  }, [closeModal]);

  // Add/remove keydown listener
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !selectedArtwork) {
    return null;
  }

  // Build location string from available parts
  const locationParts = [
    selectedArtwork.city,
    selectedArtwork.state,
    selectedArtwork.country
  ].filter(Boolean);
  const location = locationParts.join(', ');

  // Build metadata lines
  const metadataLines = [
    { label: 'Title', value: selectedArtwork.title },
    { label: 'Artist', value: selectedArtwork.artistName },
    { label: 'Date', value: selectedArtwork.date },
    { label: 'Medium', value: selectedArtwork.medium },
    { label: 'Dimensions', value: selectedArtwork.dimensions },
    { label: 'Culture', value: selectedArtwork.culture },
    { label: 'Period', value: selectedArtwork.period },
    { label: 'Dynasty', value: selectedArtwork.dynasty },
    { label: 'Portfolio', value: selectedArtwork.portfolio },
    { label: 'Location', value: location },
    { label: 'Department', value: selectedArtwork.department },
    { label: 'Gallery', value: selectedArtwork.gallery ? `Gallery ${selectedArtwork.gallery}` : null },
    { label: 'Credit', value: selectedArtwork.creditLine },
  ].filter(item => item.value); // Only show fields with values

  return (
    <div className="artwork-modal-backdrop" onClick={closeModal}>
      <div className="artwork-modal-container">
        <Banner isScrolled={true} />

        <div className="artwork-modal-card">
          <div className="artwork-modal-content">
            <div className="artwork-modal-image-container">
              <img
                src={selectedArtwork.primaryImage || selectedArtwork.imageUrl}
                alt={`${selectedArtwork.title} by ${selectedArtwork.artistName}`}
                className="artwork-modal-image"
              />
            </div>

            <div className="artwork-modal-metadata">
              {metadataLines.map((item, index) => (
                <div key={index} className="metadata-line">
                  <span className="metadata-label">{item.label}:</span>
                  <span className="metadata-value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
