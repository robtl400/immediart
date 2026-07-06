import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
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

const LIKES_STORAGE_KEY = 'immediart_liked_artworks';
const HINT_STORAGE_KEY = 'immediart_hint_seen';

export default function DiscoveryFeed() {
  const { artworks, loading, loadingMore, error, hasMore, loadMoreArtworks, retryLoadMore, retry, pause } = useArtworks();
  const { openModal } = useArtworkModal();
  const navigate = useNavigate();

  const feedRef = useRef(null);

  const [likedArtworks, setLikedArtworks] = useState(() => {
    try {
      const stored = localStorage.getItem(LIKES_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [isScrolled, setIsScrolled] = useState(false);

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
    rootRef: feedRef,
    rootMargin: FEED_ROOT_MARGIN
  });

  // Scroll anchoring: when maxInMemory trims cards off the top of the list,
  // the remaining content shifts up and a snap-scroll container visibly jumps.
  // Record each card's content-relative top after every layout-affecting
  // commit; when a trim actually removed the previous first card, shift
  // scrollTop by the anchor card's position delta so the viewport stays put.
  // showHint/isScrolled are deps because the hint bar and banner padding are
  // in-flow — their commits shift card positions and must refresh the
  // baseline, or the next trim would apply their shift as a spurious jump.
  const cardTopsRef = useRef(new Map());
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const feedTop = feed.getBoundingClientRect().top;
    const scrollTop = feed.scrollTop;
    const cards = Array.from(feed.querySelectorAll('[data-artwork-id]'));
    const tops = new Map(cards.map(el => [
      el.dataset.artworkId,
      el.getBoundingClientRect().top - feedTop + scrollTop,
    ]));
    const prevTops = cardTopsRef.current;
    const prevFirstId = prevTops.keys().next().value;
    const trimmed = prevFirstId !== undefined && !tops.has(prevFirstId);
    if (trimmed) {
      for (const [id, top] of tops) {
        const prev = prevTops.get(id);
        if (prev !== undefined) {
          const delta = top - prev;
          if (Math.abs(delta) > 1) feed.scrollTop += delta;
          break; // anchor on the first card that survived the trim
        }
      }
    }
    cardTopsRef.current = tops;
  }, [artworks, showHint, isScrolled]);

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

  // Like toggle — persistence lives in an effect so the state updater stays
  // pure (StrictMode double-invokes updaters)
  const handleLike = (id) => {
    setLikedArtworks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify([...likedArtworks]));
    } catch { /* ignore quota errors */ }
  }, [likedArtworks]);

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
  const artistHover = useMemo(() => debounce((name) => searchByArtist(name).catch(() => {}), 150), []);
  const tagHover = useMemo(() => debounce((tag) => searchByTag(tag).catch(() => {}), 150), []);
  useEffect(() => () => { artistHover.cancel(); tagHover.cancel(); }, [artistHover, tagHover]);

  // Loading state
  if (loading) {
    return (
      <div className="discovery-feed app-frame" ref={feedRef}>
        <Banner feedRef={feedRef} />
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (error && artworks.length === 0) {
    return (
      <div className="discovery-feed app-frame" ref={feedRef}>
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
    <div className="discovery-feed app-frame" ref={feedRef}>
      <Banner isScrolled={isScrolled} feedRef={feedRef} />

      {showHint && artworks.length > 0 && (
        <div className="first-visit-hint" role="status" aria-live="polite">
          <span>Tap image for details</span>
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
          onImageClick={() => openModal(artwork)}
          onArtistClick={handleArtistClick}
          onTagClick={handleTagClick}
          onArtistHover={artistHover}
          onTagHover={tagHover}
        />
      ))}

      <div ref={sentinelRef} className="scroll-sentinel" />

      {loadingMore && <InlineLoader />}

      {error && artworks.length > 0 && (
        <div className="inline-error" role="status">
          <p>{error}</p>
          <button className="retry-button" onClick={retryLoadMore}>Try Again</button>
        </div>
      )}

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
