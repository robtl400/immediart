import { useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
import './GridBrowse.css';
import { useGridBrowse } from '../../context/GridBrowseContext';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import Banner from '../common/Banner';
import { InlineLoader } from '../common/LoadingSpinner';
import ThumbnailCard from './ThumbnailCard';
import SkeletonCard from '../common/SkeletonCard';
import ArtistProfileHeader from './ArtistProfileHeader';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import { GRID_ROOT_MARGIN } from '../../utils/constants';

// Hoisted out of GridBrowse so the header subtree isn't remounted on every
// render (an inline component gets a new type identity each render).
function GridHeader({ displayTerm, onBack }) {
  return (
    <>
      <Banner />
      <div className="search-heading">
        <button className="grid-back-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h2 className="search-term">{displayTerm}</h2>
      </div>
    </>
  );
}

// decodeURIComponent throws URIError on malformed escapes (e.g. /artist/%E0) —
// fall back to the raw segment rather than crashing the render.
function safeDecode(term) {
  if (!term) return '';
  try {
    return decodeURIComponent(term);
  } catch {
    return term;
  }
}

export default function GridBrowse({ type }) {
  const params = useParams();
  const rawTerm = type === 'artist' ? params.artistName : params.tagName;
  const searchTerm = safeDecode(rawTerm);

  const {
    artworks, loading, loadingMore, error, hasMore,
    searchType: ctxType, searchTerm: ctxTerm,
    initSearch, loadMore, retryLoadMore, abort,
  } = useGridBrowse();
  const { openModal } = useArtworkModal();
  const navigate = useNavigate();
  const location = useLocation();
  const seedArtworks = location.state?.seedArtworks ?? [];

  const gridRef = useRef(null);
  const lastSearchRef = useRef('');

  // Infinite scroll
  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    enabled: !loading,
    rootRef: gridRef,
    rootMargin: GRID_ROOT_MARGIN
  });

  // Initialize search on mount or term change
  useEffect(() => {
    if (searchTerm && searchTerm !== lastSearchRef.current) {
      lastSearchRef.current = searchTerm;
      initSearch(type, searchTerm, seedArtworks);
    }
  // seedArtworks is stable per navigation — only re-run when term/type changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, searchTerm, initSearch]);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abort();
      lastSearchRef.current = '';
    };
  }, [abort]);

  // Format display term
  const displayTerm = type === 'artist'
    ? `@${searchTerm.toLowerCase().replace(/\s+/g, '_')}`
    : `#${searchTerm.replace(/\s+/g, '')}`;

  const header = <GridHeader displayTerm={displayTerm} onBack={() => navigate(-1)} />;

  // initSearch runs in an effect (after paint), so the context still holds the
  // PREVIOUS search on this render's first frame — showing either a stale grid
  // or a spurious "No artworks found". Treat "context not yet initialised for
  // THIS route" as loading so the skeleton covers the gap.
  const notInitialised = ctxTerm !== searchTerm || ctxType !== type;

  // Loading
  if (loading || notInitialised) {
    return (
      <div className="grid-browse app-frame" ref={gridRef}>
        {header}
        <div className="thumbnail-grid columns-2">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Error — full-screen only when nothing is showing; a load-more error on a
  // populated grid renders inline below the results instead of wiping them.
  if (error && artworks.length === 0) {
    return (
      <div className="grid-browse app-frame" ref={gridRef}>
        {header}
        <div className="error-container">
          <p className="error-message">Unable to load artworks</p>
          <p className="error-detail">{error}</p>
          <button
            className="retry-button"
            onClick={() => initSearch(type, searchTerm)}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty
  if (artworks.length === 0) {
    return (
      <div className="grid-browse app-frame" ref={gridRef}>
        {header}
        <div className="empty-state">
          <img src={flyingMachineIcon} alt="" className="empty-state-icon" />
          <p className="empty-state-message">No artworks found for this search.</p>
          <button className="empty-state-cta" onClick={() => navigate('/')}>
            Explore the collection
          </button>
        </div>
      </div>
    );
  }

  // Results
  return (
    <div className="grid-browse app-frame" ref={gridRef}>
      {header}

      {type === 'artist' && (
        <ArtistProfileHeader artistName={searchTerm} artworks={artworks} />
      )}

      <div className="thumbnail-grid columns-2">
        {artworks.map((artwork) => (
          <ThumbnailCard key={artwork.id} artwork={artwork} onClick={() => openModal(artwork)} />
        ))}
      </div>

      <div ref={sentinelRef} className="scroll-sentinel" />

      {loadingMore && <InlineLoader />}

      {error && (
        <div className="inline-error" role="status">
          <p>{error}</p>
          <button className="retry-button" onClick={retryLoadMore}>Try Again</button>
        </div>
      )}

      {!hasMore && artworks.length > 0 && (
        <div className="end-message">
          <img src={flyingMachineIcon} alt="" className="end-message-icon" />
          <p>{artworks.length} artwork{artworks.length !== 1 ? 's' : ''} found</p>
        </div>
      )}
    </div>
  );
}
