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
  const sentinelRef = useRef(null);
  const [likedArtworks, setLikedArtworks] = useState(new Set());
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll detection for banner state
  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop } = feedRef.current;
    setIsScrolled(scrollTop > 500);
  }, []);

  // Attach scroll listener for banner
  useEffect(() => {
    const feedElement = feedRef.current;
    if (feedElement) {
      feedElement.addEventListener('scroll', handleScroll);
      return () => feedElement.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Pre-fetch next batch immediately after initial load
  useEffect(() => {
    if (!loading && artworks.length > 0 && hasMore && !loadingMore) {
      loadMoreArtworks();
    }
  }, [loading]); // Only run when loading state changes

  // IntersectionObserver for infinite scroll - triggers ~2 artworks ahead
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    const feed = feedRef.current;
    if (!sentinel || !feed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreArtworks();
        }
      },
      {
        root: feed,
        rootMargin: '1200px' // Trigger ~2 artworks before sentinel is visible
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadingMore, loadMoreArtworks]);

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
          <div className="banner-content">
            <img src={flyingMachineIcon} alt="" className="banner-logo" />
            <h1 className="banner-title">ImmediArt</h1>
          </div>
        </header>
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (error && artworks.length === 0) {
    return (
      <div className="discovery-feed">
        <header className="banner">
          <div className="banner-content">
            <img src={flyingMachineIcon} alt="" className="banner-logo" />
            <h1 className="banner-title">ImmediArt</h1>
          </div>
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
      <header className={`banner ${isScrolled ? 'scrolled' : ''}`}>
        <div className="banner-content">
          <img src={flyingMachineIcon} alt="" className="banner-logo" />
          <h1 className="banner-title">ImmediArt</h1>
        </div>
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

      {/* Sentinel element for IntersectionObserver */}
      <div ref={sentinelRef} className="scroll-sentinel" />

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
          {artwork.description}.
          {artwork.tags.length > 0 && (
            <>
              {artwork.tags.map((tag, index) => (
                <>
                  {'  '}
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
                </>
              ))}
            </>
          )}
        </p>

        {artwork.date && <p className="artwork-date">{artwork.date}</p>}
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
