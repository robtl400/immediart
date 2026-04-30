import { useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';

/**
 * ArtworkCard Component
 *
 * Purely presentational — navigation side effects are lifted to DiscoveryFeed
 * via onArtistClick and onTagClick props.
 */
export default function ArtworkCard({ artwork, isLiked, onLike, onImageDoubleClick, onArtistClick, onTagClick, onArtistHover, onTagHover }) {
  const navigate = useNavigate();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLandscape, setIsLandscape] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);

  const handleImageLoad = (e) => {
    const img = e.target;
    setIsLandscape(img.naturalWidth >= img.naturalHeight);
    setImageLoaded(true);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/artwork/${artwork.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: artwork.title, text: `${artwork.title} by ${artwork.artistName}`, url });
      } catch (err) {
        if (err.name !== 'AbortError') {
          try {
            await navigator.clipboard?.writeText(url);
          } catch (_) { /* clipboard unavailable */ }
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 2000);
        }
      }
    } else {
      try {
        await navigator.clipboard?.writeText(url);
      } catch (_) { /* clipboard unavailable */ }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const handleArtistClick = () => {
    // Guard: anonymous works have no artistName — skip navigation
    if (!artwork.artistName) return;
    if (onArtistClick) {
      onArtistClick(artwork.artistName, artwork);
    } else {
      navigate(`/artist/${encodeURIComponent(artwork.artistName)}`);
    }
  };

  const handleHashtagClick = (tag) => {
    if (onTagClick) {
      onTagClick(tag, artwork);
    } else {
      navigate(`/tag/${encodeURIComponent(tag)}`);
    }
  };

  const hasArtist = Boolean(artwork.artistName);

  return (
    <article className="artwork-card">
      {/* Image Container */}
      <div className={`image-container ${isLandscape ? 'landscape' : 'portrait'}`}>
        <img
          src={artwork.imageUrl}
          alt={`${artwork.title}${hasArtist ? ` by ${artwork.artistName}` : ''}`}
          className="artwork-image"
          onLoad={handleImageLoad}
          onClick={onImageDoubleClick}
          loading="lazy"
        />
        <div className={`image-placeholder${imageLoaded ? ' loaded' : ''}`} />
      </div>

      {/* Post Meta Bar — date + location (left) and action buttons (right) */}
      <div className="post-meta-bar">
        {(artwork.date || artwork.gallery || artwork.city?.trim()) && (
          <div className="meta-left">
            {artwork.date && <span className="post-date">Posted: {artwork.date}</span>}
            {(artwork.gallery || artwork.city?.trim()) && (
              <span className="post-location">
                <svg width="9" height="12" viewBox="0 0 9 12" fill="currentColor" aria-hidden="true">
                  <path d="M4.5 0C2.01 0 0 2.01 0 4.5c0 3.375 4.5 7.5 4.5 7.5S9 7.875 9 4.5C9 2.01 6.99 0 4.5 0zm0 6.25a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5z"/>
                </svg>
                {artwork.gallery
                  ? ` Gallery ${artwork.gallery}`
                  : ` ${artwork.city.trim()}${artwork.country ? `, ${artwork.country}` : ''}`}
              </span>
            )}
          </div>
        )}
        <div className="action-buttons">
          <button
            className={`action-btn like-btn ${isLiked ? 'liked' : ''}`}
            onClick={onLike}
            aria-label={isLiked ? 'Unlike' : 'Like'}
          >
            <span className="icon heart-icon">{isLiked ? '♥' : '♡'}</span>
            <span className="btn-label">Like</span>
          </button>

          <button className="action-btn share-btn" onClick={handleShare} aria-label="Share">
            <img src={flyingMachineIcon} alt="Share" className="icon share-icon" />
            <span className="btn-label">{shareCopied ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Text Information */}
      <div className="text-info">
        <p className="artwork-description">
          {hasArtist ? (
            <span
              className="artist-name clickable"
              onClick={handleArtistClick}
              onMouseEnter={() => onArtistHover?.(artwork.artistName)}
              onFocus={() => onArtistHover?.(artwork.artistName)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleArtistClick()}
            >
              {artwork.username}
            </span>
          ) : (
            <span className="artist-name">{artwork.username}</span>
          )}
          {artwork.isHighlight && (
            <span className="verified-badge" aria-label="Museum Highlight">✓</span>
          )}{' '}
          {artwork.description && `${artwork.description}.`}
          {artwork.tags.map((tag, index) => (
            <Fragment key={index}>
              {'  '}
              <span
                className="hashtag"
                onClick={() => handleHashtagClick(tag)}
                onMouseEnter={() => onTagHover?.(tag)}
                onFocus={() => onTagHover?.(tag)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleHashtagClick(tag)}
              >
                #{tag.replace(/\s+/g, '')}
              </span>
            </Fragment>
          ))}
        </p>

        {artwork.creditLine?.trim() && (
          <p className="sponsored-post">
            <span className="sponsored-label">Sponsored Post:</span>{' '}
            {artwork.creditLine.trim()}
          </p>
        )}
      </div>

      {/* Comments */}
      {artwork.comments.length > 0 && (
        <div className="comment-section">
          {artwork.comments.map((comment, index) => (
            <div key={index} className="comment">
              <span className="comment-username">{comment.username}</span>{' '}
              <span className="comment-text">{comment.text}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
