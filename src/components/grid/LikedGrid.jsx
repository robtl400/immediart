import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import './GridBrowse.css';
import { usePaginatedFetch } from '../../hooks/usePaginatedFetch';
import { useLikes } from '../../context/LikesContext';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import { preloadArtworkImages } from '../../utils/imageLoader';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import Banner from '../common/Banner';
import { InlineLoader } from '../common/LoadingSpinner';
import SkeletonCard from '../common/SkeletonCard';
import ThumbnailCard from './ThumbnailCard';
import { GRID_BATCH_SIZE, GRID_INITIAL_BATCH_SIZE, GRID_ROOT_MARGIN } from '../../utils/constants';

// Liked artworks. Powered by the shared paginated hook over a mount-time
// snapshot of the liked IDs (newest first). Renders its own loading / error /
// empty / grid branches — the hook returns state, not UI.
export default function LikedGrid() {
  const navigate = useNavigate();
  const { likedIds, isLiked, toggleLike, pruneLike } = useLikes();
  const { openModal } = useArtworkModal();
  const gridRef = useRef(null);

  const grid = usePaginatedFetch({
    shuffleIDs: false,
    batchSize: GRID_BATCH_SIZE,
    initialBatchSize: GRID_INITIAL_BATCH_SIZE,
    maxInMemory: Infinity,
    onBatchReady: (artworks, signal, outcomes) => {
      preloadArtworkImages(artworks, signal);
      // Prune any liked ID the Met API now definitively 404s (never on a
      // transient 'error' — that would delete a like over a network blip).
      if (outcomes) {
        for (const [id, status] of outcomes) {
          if (status === 'notFound') pruneLike(id);
        }
      }
    },
  });

  const { reset, pause, loadMore } = grid;

  // Snapshot at mount so unliking a tile mid-session doesn't reshuffle the grid;
  // likes added elsewhere appear on the next visit.
  useEffect(() => {
    const snapshot = [...likedIds].reverse(); // newest liked first
    reset(() => Promise.resolve(snapshot));
    return () => pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, pause]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore: grid.hasMore,
    isLoading: grid.loadingMore,
    enabled: !grid.loading,
    rootRef: gridRef,
    rootMargin: GRID_ROOT_MARGIN,
  });

  const header = (
    <>
      <Banner />
      <div className="search-heading">
        <button className="grid-back-btn" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="search-term">Liked</h2>
      </div>
    </>
  );

  if (grid.loading) {
    return (
      <div className="grid-browse app-frame" ref={gridRef}>
        {header}
        <div className="thumbnail-grid columns-2">
          {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (grid.error && grid.artworks.length === 0) {
    return (
      <div className="grid-browse app-frame" ref={gridRef}>
        {header}
        <div className="error-container">
          <p className="error-message">Unable to load liked artworks</p>
          <p className="error-detail">{grid.error}</p>
          <button className="retry-button" onClick={grid.retryLoadMore}>Try Again</button>
        </div>
      </div>
    );
  }

  if (grid.artworks.length === 0) {
    return (
      <div className="grid-browse app-frame" ref={gridRef}>
        {header}
        <div className="empty-state">
          <img src={flyingMachineIcon} alt="" className="empty-state-icon" />
          <p className="empty-state-message">No liked artworks yet.</p>
          <button className="empty-state-cta" onClick={() => navigate('/')}>
            Explore the collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-browse app-frame" ref={gridRef}>
      {header}

      <div className="thumbnail-grid columns-2">
        {grid.artworks.map((artwork) => {
          const stillLiked = isLiked(artwork.id);
          // Unliking dims the tile in place and leaves it tappable to re-like
          // (a mis-tap is recoverable); it's gone on the next visit.
          return (
            <div key={artwork.id} className={`liked-tile${stillLiked ? '' : ' liked-tile--dimmed'}`}>
              <ThumbnailCard
                artwork={artwork}
                onClick={() => (stillLiked ? openModal(artwork) : toggleLike(artwork.id))}
              />
              {!stillLiked && <span className="liked-tile-badge" aria-hidden="true">♡</span>}
            </div>
          );
        })}
      </div>

      <div ref={sentinelRef} className="scroll-sentinel" />

      {grid.loadingMore && <InlineLoader />}

      {grid.error && (
        <div className="inline-error" role="status">
          <p>{grid.error}</p>
          <button className="retry-button" onClick={grid.retryLoadMore}>Try Again</button>
        </div>
      )}

      {!grid.hasMore && grid.artworks.length > 0 && (
        <div className="end-message">
          <img src={flyingMachineIcon} alt="" className="end-message-icon" />
          <p>{grid.artworks.length} liked artwork{grid.artworks.length !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}
