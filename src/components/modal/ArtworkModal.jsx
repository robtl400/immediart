import { useEffect, useCallback, useRef, useState } from 'react';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import Banner from '../common/Banner';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import './ArtworkModal.css';

export default function ArtworkModal() {
  const { selectedArtwork, isOpen, closeModal } = useArtworkModal();
  const modalRef = useRef(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => setImageError(false), [selectedArtwork]);

  // Handle ESC key and Tab trapping
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    // Trap Tab focus inside modal
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll(
        'button, [href], input, [tabIndex]:not([tabIndex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
  }, [closeModal]);

  // Add/remove keydown listener and manage focus
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      // Move focus into modal
      const firstFocusable = modalRef.current?.querySelector(
        'button, [href], input, [tabIndex]:not([tabIndex="-1"])'
      );
      firstFocusable?.focus();
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
    <div
      className="artwork-modal-backdrop"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Artwork details"
      ref={modalRef}
    >
      <div className="artwork-modal-container">
        <Banner isScrolled={true} />

        <div className="artwork-modal-card" onClick={e => e.stopPropagation()}>
          <button
            className="modal-close-btn"
            onClick={closeModal}
            aria-label="Close artwork details"
          >
            ×
          </button>
          <div className="artwork-modal-content">
            <div className="artwork-modal-image-container">
              {imageError ? (
                <div className="modal-image-fallback">
                  <img src={flyingMachineIcon} alt="" className="modal-image-fallback-icon" />
                  <p className="modal-image-fallback-text">Image unavailable</p>
                </div>
              ) : (
                <img
                  src={selectedArtwork.primaryImageFull || selectedArtwork.imageUrl}
                  alt={selectedArtwork.artistName
                    ? `${selectedArtwork.title} by ${selectedArtwork.artistName}`
                    : selectedArtwork.title}
                  className="artwork-modal-image"
                  onError={() => setImageError(true)}
                />
              )}
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
