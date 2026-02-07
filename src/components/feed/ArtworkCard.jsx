import { useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtworks } from '../../context/ArtworksContext';
import flyingMachineIcon from '../../assets/FlyingMachine2.png';

/**
 * ArtworkCard Component
 */
export default function ArtworkCard({ artwork, isLiked, onLike, onImageDoubleClick }) {
  const navigate = useNavigate();
  const { pause } = useArtworks();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLandscape, setIsLandscape] = useState(true);

  const handleImageLoad = (e) => {
    const img = e.target;
    setIsLandscape(img.naturalWidth >= img.naturalHeight);
    setImageLoaded(true);
  };

  const handleShare = () => {
    console.log(`Share artwork: ${artwork.title}`);
  };

  const handleArtistClick = () => {
    pause(); // Abort feed requests before navigating
    navigate(`/artist/${encodeURIComponent(artwork.artistName)}`);
  };

  const handleHashtagClick = (tag) => {
    pause(); // Abort feed requests before navigating
    navigate(`/tag/${encodeURIComponent(tag)}`);
  };

  return (
    <article className="artwork-card">
      {/* Image Container */}
      <div className={`image-container ${isLandscape ? 'landscape' : 'portrait'}`}>
        <img
          src={artwork.imageUrl}
          alt={`${artwork.title} by ${artwork.artistName}`}
          className="artwork-image"
          onLoad={handleImageLoad}
          onDoubleClick={onImageDoubleClick}
          loading="lazy"
        />
        {!imageLoaded && <div className="image-placeholder" />}
      </div>

      {/* Action Buttons */}
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
          <span className="btn-label">Share</span>
        </button>
      </div>

      {/* Text Information */}
      <div className="text-info">
        <p className="artwork-description">
          <span
            className="artist-name clickable"
            onClick={handleArtistClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleArtistClick()}
          >
            {artwork.username}
          </span>{' '}
          {artwork.description}.
          {artwork.tags.map((tag, index) => (
            <Fragment key={index}>
              {'  '}
              <span
                className="hashtag"
                onClick={() => handleHashtagClick(tag)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleHashtagClick(tag)}
              >
                #{tag.replace(/\s+/g, '')}
              </span>
            </Fragment>
          ))}
        </p>

        {artwork.date && <p className="artwork-date">Posted: {artwork.date}</p>}
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
