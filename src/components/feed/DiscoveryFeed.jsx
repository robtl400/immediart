import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import './DiscoveryFeed.css';
import { useArtworks } from '../../context/ArtworksContext';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import LoadingSpinner, { InlineLoader } from '../common/LoadingSpinner';
import Banner from '../common/Banner';
import ArtworkCard from './ArtworkCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import { FEED_ROOT_MARGIN, BANNER_SCROLL_THRESHOLD } from '../../utils/constants';
import { searchByArtist, searchByTag } from '../../services/metAPI';
import { debounce } from '../../utils/delay';

export default function DiscoveryFeed() {
  const { artworks, loading, loadingMore, error, hasMore, loadMoreArtworks, retry, pause } = useArtworks();
  const { openModal } = useArtworkModal();
  const navigate = useNavigate();

  const feedRef = useRef(null);

  const LIKES_STORAGE_KEY = 'immediart_liked_artworks';
  const [likedArtworks, setLikedArtworks] = useState(() => {
    try {
      const stored = localStorage.getItem(LIKES_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [isScrolled, setIsScrolled] = useState(false);

  const HINT_STORAGE_KEY = 'immediart_hint_seen';
  const [showHint, setShowHint] = useState(() => {
    try {
      return !localStorage.getItem(HINT_STORAGE_KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => {
      setShowHint(false);
      try { localStorage.setItem(HINT_STORAGE_KEY, '1'); } catch { /* ignore */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [showHint]);

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

  // Like toggle
  const handleLike = (id) => {
    setLikedArtworks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify([...next]));
      } catch { /* ignore quota errors */ }
      return next;
    });
  };

  const handleArtistClick = useCallback((artistName, artwork) => {
    pause();
    navigate(`/artist/${encodeURIComponent(artistName)}`, {
      state: { seedArtworks: [artwork] },
    });
  }, [pause, navigate]);

  const handleTagClick = useCallback((tag, artwork) => {
    pause();
    navigate(`/tag/${encodeURIComponent(tag)}`, {
      state: { seedArtworks: [artwork] },
    });
  }, [pause, navigate]);

  // Hover prefetch — warm IndexedDB cache before user clicks artist/tag chip
  const artistHoverRef = useRef(debounce((name) => searchByArtist(name).catch(() => {}), 150));
  const tagHoverRef = useRef(debounce((tag) => searchByTag(tag).catch(() => {}), 150));

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

      {showHint && artworks.length > 0 && (
        <div className="first-visit-hint" role="status" aria-live="polite">
          <span>Double-tap image for details</span>
          <span className="hint-separator">·</span>
          <span>Tap artist or tag to explore</span>
        </div>
      )}

      {artworks.map((artwork) => (
        <ArtworkCard
          key={artwork.id}
          artwork={artwork}
          isLiked={likedArtworks.has(artwork.id)}
          onLike={() => handleLike(artwork.id)}
          onImageDoubleClick={() => openModal(artwork)}
          onArtistClick={handleArtistClick}
          onTagClick={handleTagClick}
          onArtistHover={artistHoverRef.current}
          onTagHover={tagHoverRef.current}
        />
      ))}

      <div ref={sentinelRef} className="scroll-sentinel" />

      {loadingMore && <InlineLoader />}

      {!hasMore && artworks.length > 0 && (
        <div className="end-message">
          <img src={flyingMachineIcon} alt="" className="end-message-icon" />
          <p>You&apos;ve explored the whole collection.</p>
          <p>Come back for more.</p>
        </div>
      )}
    </div>
  );
}
