import { useState, useEffect, useRef, useCallback } from 'react';
import './DiscoveryFeed.css';
import flyingMachineIcon from '../assets/FlyingMachine2.png';
import { useArtworks } from '../context/ArtworksContext';
import LoadingSpinner, { InlineLoader } from './LoadingSpinner';

export default function DiscoveryFeed() {
  const {
    artworks,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMoreArtworks,
    retry
  } = useArtworks();

  const feedRef = useRef(null);
  const [likedArtworks, setLikedArtworks] = useState(new Set());

  // Scroll detection for infinite scroll
  const handleScroll = useCallback(() => {
    if (!feedRef.current || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const scrollThreshold = 300; // pixels from bottom

    if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
      loadMoreArtworks();
    }
  }, [loadingMore, hasMore, loadMoreArtworks]);

  // Attach scroll listener
  useEffect(() => {
    const feedElement = feedRef.current;
    if (feedElement) {
      feedElement.addEventListener('scroll', handleScroll);
      return () => feedElement.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Handle like toggle
  const handleLike = (artworkId) => {
    setLikedArtworks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(artworkId)) {
        newSet.delete(artworkId);
      } else {
        newSet.add(artworkId);
      }
      return newSet;
    });
  };

  // Initial loading state
  if (loading) {
    return (
      <div className="discovery-feed">
        <header className="banner">
          <h1 className="banner-title">ImmediArt</h1>
        </header>
        <LoadingSpinner message="Discovering artworks..." />
      </div>
    );
  }

  // Error state
  if (error && artworks.length === 0) {
    return (
      <div className="discovery-feed">
        <header className="banner">
          <h1 className="banner-title">ImmediArt</h1>
        </header>
        <div className="error-container">
          <p className="error-message">Unable to load artworks</p>
          <p className="error-detail">{error}</p>
          <button className="retry-button" onClick={retry}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="discovery-feed" ref={feedRef}>
      <header className="banner">
        <h1 className="banner-title">ImmediArt</h1>
      </header>

      {/* Render each artwork */}
      {artworks.map((artwork) => (
        <ArtworkCard
          key={artwork.id}
          artwork={artwork}
          isLiked={likedArtworks.has(artwork.id)}
          onLike={() => handleLike(artwork.id)}
        />
      ))}

      {/* Loading more indicator */}
      {loadingMore && <InlineLoader />}

      {/* End of feed message */}
      {!hasMore && artworks.length > 0 && (
        <div className="end-message">
          <p>You have seen all available artworks!</p>
          <p>New artworks coming soon...</p>
        </div>
      )}
    </div>
  );
}

// Extract ArtworkCard to separate component for performance
function ArtworkCard({ artwork, isLiked, onLike }) {
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

  const handleHashtagClick = (tag) => {
    console.log(`Hashtag #${tag} clicked - will navigate to grid view`);
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
          <span className="artist-name">{artwork.username}</span>{' '}
          {artwork.description}
        </p>

        {artwork.date && <p className="artwork-date">{artwork.date}</p>}

        {artwork.tags.length > 0 && (
          <div className="hashtags">
            {artwork.tags.map((tag, index) => (
              <span
                key={index}
                className="hashtag"
                onClick={() => handleHashtagClick(tag)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleHashtagClick(tag)}
              >
                #{tag.replace(/\s+/g, '')}
              </span>
            ))}
          </div>
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
