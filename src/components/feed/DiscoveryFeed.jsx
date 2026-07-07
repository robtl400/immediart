import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import './DiscoveryFeed.css';
import { useArtworks } from '../../context/ArtworksContext';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import { useLikes } from '../../context/LikesContext';
import LoadingSpinner, { InlineLoader } from '../common/LoadingSpinner';
import Banner from '../common/Banner';
import ArtworkCard from './ArtworkCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import { FEED_ROOT_MARGIN, BANNER_SCROLL_THRESHOLD } from '../../utils/constants';
import { searchByArtist, searchByTag } from '../../services/metAPI';
import { debounce } from '../../utils/delay';

const HINT_STORAGE_KEY = 'immediart_hint_seen';

export default function DiscoveryFeed() {
  const { artworks, loading, loadingMore, error, hasMore, loadMoreArtworks, retryLoadMore, retry, pause, feedScrollRef } = useArtworks();
  const { openModal } = useArtworkModal();
  const { isLiked, toggleLike } = useLikes();
  const navigate = useNavigate();

  const feedRef = useRef(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll restoration: the scroll handler below keeps feedScrollRef current, so
  // navigating to /liked, /search or a grid (which unmounts the feed) leaves the
  // last offset in the ref. Restore it on the next mount. Modal trips keep the
  // feed mounted (background route), so they preserve scroll for free.
  useLayoutEffect(() => {
    if (feedRef.current && feedScrollRef.current) {
      feedRef.current.scrollTop = feedScrollRef.current;
    }
    // Restore once per mount after the persisted artworks have rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Measure each mounted card's content-relative top (independent of scroll).
  const measureCardTops = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return null;
    const feedTop = feed.getBoundingClientRect().top;
    const scrollTop = feed.scrollTop;
    return new Map(
      Array.from(feed.querySelectorAll('[data-artwork-id]')).map(el => [
        el.dataset.artworkId,
        el.getBoundingClientRect().top - feedTop + scrollTop,
      ])
    );
  }, []);

  useLayoutEffect(() => {
    const feed = feedRef.current;
    const tops = measureCardTops();
    if (!feed || !tops) return;
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
  }, [artworks, showHint, isScrolled, measureCardTops]);

  // A card's image loading flips its container height (portrait ↔ landscape)
  // WITHOUT a parent re-render, so the layout effect above never re-runs and
  // its baseline goes stale — a subsequent trim would then apply that height
  // shift as a spurious jump. A ResizeObserver re-baselines (measure only, no
  // compensation) whenever a card's box changes, keeping the anchor honest.
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const tops = measureCardTops();
        if (tops) cardTopsRef.current = tops;
      });
    });
    feed.querySelectorAll('[data-artwork-id]').forEach(el => observer.observe(el));
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [artworks, measureCardTops]);

  // Banner scroll detection + scroll-restoration bookkeeping (keep the offset
  // current so it survives the feed unmounting on navigation).
  const handleScroll = useCallback(() => {
    const feed = feedRef.current;
    if (feed) {
      setIsScrolled(feed.scrollTop > BANNER_SCROLL_THRESHOLD);
      feedScrollRef.current = feed.scrollTop;
    }
  }, [feedScrollRef]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

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

  // Latest artworks via a ref so the keyboard listener below can stay subscribed
  // once (not re-bind on every feed update). Synced in an effect (never mutate
  // a ref during render).
  const artworksRef = useRef(artworks);
  useEffect(() => { artworksRef.current = artworks; });

  // Feed keyboard navigation: ↑/↓ or j/k move between cards, l likes the current
  // card, Enter opens its modal, / focuses search (a no-op until search ships).
  // Typing in an input is never hijacked (Escape excepted). "Current card" is
  // the one nearest the top of the snap viewport.
  useEffect(() => {
    const onKey = (e) => {
      // The feed stays mounted under an open modal (a /artwork/:id route on top)
      // — don't let its shortcuts act on the hidden feed while the modal is up.
      if (window.location.pathname.startsWith('/artwork/')) return;

      const t = e.target;
      if ((t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) && e.key !== 'Escape') return;

      const feed = feedRef.current;
      if (!feed) return;
      const cards = Array.from(feed.querySelectorAll('[data-artwork-id]'));
      if (cards.length === 0) return;

      const currentIndex = () => {
        const top = feed.scrollTop;
        let best = 0, bestDist = Infinity;
        cards.forEach((el, i) => {
          const d = Math.abs(el.offsetTop - top);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        return best;
      };

      // JS scroll behaviour isn't governed by the CSS reduced-motion reset —
      // honour the preference here too.
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          cards[Math.min(currentIndex() + 1, cards.length - 1)].scrollIntoView({ block: 'start', behavior });
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          cards[Math.max(currentIndex() - 1, 0)].scrollIntoView({ block: 'start', behavior });
          break;
        case 'l':
          e.preventDefault();
          toggleLike(Number(cards[currentIndex()].dataset.artworkId));
          break;
        case 'Enter': {
          // Only when nothing card-level is focused — a focused card element
          // handles its own Enter, so acting here too would double-open.
          if (e.target !== document.body) return;
          const id = Number(cards[currentIndex()].dataset.artworkId);
          const art = artworksRef.current.find(a => a.id === id);
          if (art) openModal(art);
          break;
        }
        case '/':
          e.preventDefault();
          document.querySelector('[data-search-input]')?.focus();
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openModal, toggleLike]);

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
          isLiked={isLiked(artwork.id)}
          onLike={() => toggleLike(artwork.id)}
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
