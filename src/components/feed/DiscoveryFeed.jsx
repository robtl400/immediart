import { useState, useEffect, useRef, useCallback } from 'react';
import './DiscoveryFeed.css';
import { useArtworks } from '../../context/ArtworksContext';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import LoadingSpinner, { InlineLoader } from '../common/LoadingSpinner';
import Banner from '../common/Banner';
import ArtworkCard from './ArtworkCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import { FEED_ROOT_MARGIN, BANNER_SCROLL_THRESHOLD } from '../../utils/constants';

export default function DiscoveryFeed() {
  const { artworks, loading, loadingMore, error, hasMore, loadMoreArtworks, retry, pause } = useArtworks();
  const { openModal } = useArtworkModal();

  const feedRef = useRef(null);
  const [likedArtworks, setLikedArtworks] = useState(new Set());
  const [isScrolled, setIsScrolled] = useState(false);

  // Pause fetching when navigating away
  useEffect(() => {
    return () => pause();
  }, [pause]);

  // Infinite scroll
  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMoreArtworks,
    hasMore,
    isLoading: loadingMore,
    enabled: !loading,
    root: feedRef.current,
    rootMargin: FEED_ROOT_MARGIN
  });

  // Banner scroll detection
  const handleScroll = useCallback(() => {
    if (feedRef.current) {
      setIsScrolled(feedRef.current.scrollTop > BANNER_SCROLL_THRESHOLD);
    }
  }, []);

  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Pre-fetch after initial load
  useEffect(() => {
    if (!loading && artworks.length > 0 && hasMore && !loadingMore) {
      loadMoreArtworks();
    }
  }, [loading]);

  // Like toggle
  const handleLike = (id) => {
    setLikedArtworks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="discovery-feed" ref={feedRef}>
        <Banner feedRef={feedRef} />
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (error && artworks.length === 0) {
    return (
      <div className="discovery-feed" ref={feedRef}>
        <Banner feedRef={feedRef} />
        <div className="error-container">
          <p className="error-message">Unable to load artworks</p>
          <p className="error-detail">{error}</p>
          <button className="retry-button" onClick={retry}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="discovery-feed" ref={feedRef}>
      <Banner isScrolled={isScrolled} feedRef={feedRef} />

      {artworks.map((artwork) => (
        <ArtworkCard
          key={artwork.id}
          artwork={artwork}
          isLiked={likedArtworks.has(artwork.id)}
          onLike={() => handleLike(artwork.id)}
          onImageDoubleClick={() => openModal(artwork)}
        />
      ))}

      <div ref={sentinelRef} className="scroll-sentinel" />

      {loadingMore && <InlineLoader />}

      {!hasMore && artworks.length > 0 && (
        <div className="end-message">
          <p>You have seen all available artworks!</p>
          <p>New artworks coming soon...</p>
        </div>
      )}
    </div>
  );
}
