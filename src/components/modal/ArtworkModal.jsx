import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import { useLikes } from '../../context/LikesContext';
import { useShareArtwork, shareLabel } from '../../hooks/useShareArtwork';
import { fetchArtworkByID } from '../../services/metAPI';
import { transformAPIToDisplay, artworkCaption } from '../../utils/transformers';
import { activateOnKey } from '../../utils/keyboard';
import { toWebLarge } from '../../utils/slides';
import useImageZoom from '../../hooks/useImageZoom';
import Banner from '../common/Banner';
import LoadingSpinner from '../common/LoadingSpinner';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import './ArtworkModal.css';

// Keyed per artwork by the parent, so load/error state (and zoom) reset on
// artwork change. `viewImageUrl` is set when a carousel opened the modal on a
// specific slide; otherwise it's the primary full-res image.
function ModalImage({ artwork }) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { containerRef, imgRef, handlers, isZoomed } = useImageZoom();
  // The web-large copy is what the card already showed, so it is in the
  // browser cache and paints at once. The full-resolution original can be
  // several megabytes; the zoom is the one view that needs more pixels than
  // the web-large copy, so the original is fetched only once the user zooms,
  // decoded off-screen, then swapped in.
  const full  = artwork.viewImageUrl || artwork.primaryImageFull || artwork.imageUrl;
  const quick = artwork.viewImageUrl ? toWebLarge(artwork.viewImageUrl) : artwork.imageUrl;
  const [src, setSrc] = useState(quick || full);
  useEffect(() => {
    if (!isZoomed || !full || full === src) return;
    let cancelled = false;
    const img = new Image();
    // Decode before swapping, not just fetch: an undecoded multi-MB original
    // would paint a blank frame until its bitmap is ready.
    img.onload = () => { (img.decode?.() ?? Promise.resolve()).catch(() => {}).then(() => { if (!cancelled) setSrc(full); }); };
    img.src = full;
    return () => {
      cancelled = true;
      img.onload = null;
      img.src = ''; // closing the modal cancels the transfer instead of finishing it on mobile data
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isZoomed, full]);

  if (imageError) {
    return (
      <div className="modal-image-fallback">
        <img src={flyingMachineIcon} alt="" className="modal-image-fallback-icon" />
        <p className="modal-image-fallback-text">Image unavailable</p>
      </div>
    );
  }

  return (
    <div className={`modal-image-loading-wrapper${imageLoaded ? ' loaded' : ''}`}>
      <div className="modal-image-spinner skeleton-shimmer" aria-hidden="true" />
      <div
        className={`zoom-viewport${isZoomed ? ' zoomed' : ''}`}
        ref={containerRef}
        {...handlers}
        tabIndex={0}
        role="group"
        aria-label="Zoomable artwork image"
        aria-describedby="zoom-help"
      >
        {/* Instructions as a description, not a role description: screen
            readers speak a role description IN PLACE of the role on every
            focus, and some truncate it — a description is read once, after. */}
        <p id="zoom-help" className="sr-only">Double-tap or pinch to zoom, press 0 to reset.</p>
        <img
          ref={imgRef}
          src={src}
          alt={artworkCaption(artwork)}
          className="artwork-modal-image"
          onLoad={() => setImageLoaded(true)}
          onError={() => { if (src !== full) setSrc(full); else setImageError(true); }} /* a missing web-large copy still tries the original */
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}

export default function ArtworkModal() {
  const { artworkId } = useParams();
  const id = Number(artworkId);
  const { cachedArtwork, closeModal } = useArtworkModal();
  const { isLiked, toggleLike } = useLikes();
  const { copied, failed, share } = useShareArtwork();
  const navigate = useNavigate();
  const modalRef = useRef(null);

  // Render instantly from cache when opened from a card; a direct load / shared
  // link fetches by id.
  const [artwork, setArtwork] = useState(() => (cachedArtwork?.id === id ? cachedArtwork : null));
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (cachedArtwork?.id === id) { setArtwork(cachedArtwork); setLoadError(false); return; }
    setLoadError(false);
    const controller = new AbortController();
    fetchArtworkByID(id, controller.signal)
      .then(api => { if (!api) setLoadError(true); else setArtwork(transformAPIToDisplay(api)); })
      .catch(err => { if (err.name !== 'AbortError') setLoadError(true); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Escape closes; Tab is trapped inside the dialog.
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll(
        'button, [href], input, [tabIndex]:not([tabIndex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }, [closeModal]);

  // Lock body scroll, trap keys, and restore focus to the opener on close
  // (a direct load has no opener, so focus falls to the modal itself).
  useEffect(() => {
    const opener = document.activeElement;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    const firstFocusable = modalRef.current?.querySelector(
      'button, [href], input, [tabIndex]:not([tabIndex="-1"])'
    );
    firstFocusable?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [handleKeyDown]);

  const backdropProps = {
    className: 'artwork-modal-backdrop',
    onClick: closeModal,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Artwork details',
    ref: modalRef,
  };

  if (loadError) {
    return (
      <div {...backdropProps}>
        <div className="artwork-modal-container">
          <Banner isScrolled={true} showActions={false} interactive={false} />
          <div className="artwork-modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={closeModal} aria-label="Close artwork details">‹</button>
            <div className="modal-image-fallback">
              <img src={flyingMachineIcon} alt="" className="modal-image-fallback-icon" />
              <p className="modal-image-fallback-text">Artwork not found</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!artwork) {
    return (
      <div {...backdropProps}>
        <div className="artwork-modal-container">
          <Banner isScrolled={true} showActions={false} interactive={false} />
          <div className="artwork-modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={closeModal} aria-label="Close artwork details">‹</button>
            <LoadingSpinner />
          </div>
        </div>
      </div>
    );
  }

  const locationParts = [artwork.city, artwork.state, artwork.country].filter(Boolean);
  const locationStr = locationParts.join(', ');
  const hasArtist = Boolean(artwork.artistName);
  const liked = isLiked(artwork.id);

  const goToArtist = () => {
    if (!hasArtist) return;
    // Navigating away from /artwork/:id unmounts the modal — no explicit close.
    navigate(`/artist/${encodeURIComponent(artwork.artistName)}`, { state: { seedArtworks: [artwork] } });
  };

  const metadataLines = [
    { label: 'Title', value: artwork.title },
    { label: 'Artist', value: artwork.artistName, artist: true },
    { label: 'Date', value: artwork.date },
    { label: 'Medium', value: artwork.medium },
    { label: 'Dimensions', value: artwork.dimensions },
    { label: 'Culture', value: artwork.culture },
    { label: 'Period', value: artwork.period },
    { label: 'Dynasty', value: artwork.dynasty },
    { label: 'Portfolio', value: artwork.portfolio },
    { label: 'Location', value: locationStr },
    { label: 'Department', value: artwork.department },
    { label: 'Gallery', value: artwork.gallery ? `Gallery ${artwork.gallery}` : null },
    { label: 'Credit', value: artwork.creditLine },
  ].filter(item => item.value);

  return (
    <div {...backdropProps}>
      <div className="artwork-modal-container">
        <Banner isScrolled={true} showActions={false} interactive={false} />

        <div className="artwork-modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={closeModal} aria-label="Close artwork details">‹</button>
          <div className="artwork-modal-content">
            <div className="artwork-modal-image-container">
              <ModalImage key={artwork.id} artwork={artwork} />
            </div>

            {/* Action row — mirrors the feed card's image → actions → text rhythm */}
            <div className="artwork-modal-actions">
              {/* A toggle: a constant name plus aria-pressed, so assistive tech
                  announces "Like, toggle button, pressed" rather than a name
                  that flips. The share button's name is its visible label, so
                  "Copied!" / "Couldn't copy" reach assistive tech too (a polite live
                  region rather than a status role). */}
              <button
                className={`action-btn like-btn ${liked ? 'liked' : ''}`}
                onClick={() => toggleLike(artwork.id)}
                aria-label="Like"
                aria-pressed={liked}
              >
                <span className="icon heart-icon" aria-hidden="true">{liked ? '♥' : '♡'}</span>
                <span className="btn-label">Like</span>
              </button>
              <button className="action-btn share-btn" onClick={() => share(artwork)}>
                <img src={flyingMachineIcon} alt="" className="icon share-icon" />
                <span className="btn-label" aria-live="polite">{shareLabel({ copied, failed })}</span>
              </button>
            </div>

            <div className="artwork-modal-metadata">
              {metadataLines.map((item, index) => (
                <div key={index} className="metadata-line">
                  <span className="metadata-label">{item.label}:</span>
                  {item.artist && hasArtist ? (
                    <span
                      className="metadata-value clickable"
                      onClick={goToArtist}
                      role="button"
                      tabIndex={0}
                      onKeyDown={activateOnKey(goToArtist)}
                    >
                      {item.value}
                    </span>
                  ) : (
                    <span className="metadata-value">{item.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
