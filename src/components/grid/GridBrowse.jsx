import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './GridBrowse.css';
import { useGridBrowse } from '../../context/GridBrowseContext';
import { useArtworkModal } from '../../context/ArtworkModalContext';
import Banner from '../common/Banner';
import LoadingSpinner, { InlineLoader } from '../common/LoadingSpinner';
import ThumbnailCard from './ThumbnailCard';
import useInfiniteScroll from '../../hooks/useInfiniteScroll';
import { GRID_ROOT_MARGIN } from '../../utils/constants';

export default function GridBrowse({ type }) {
  const params = useParams();
  const rawTerm = type === 'artist' ? params.artistName : params.tagName;
  const searchTerm = rawTerm ? decodeURIComponent(rawTerm) : '';

  const { artworks, loading, loadingMore, error, hasMore, initSearch, loadMore, abort } = useGridBrowse();
  const { openModal } = useArtworkModal();

  const gridRef = useRef(null);
  const lastSearchRef = useRef('');

  // Infinite scroll
  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    enabled: !loading,
    root: gridRef.current,
    rootMargin: GRID_ROOT_MARGIN
  });

  // Initialize search on mount or term change
  useEffect(() => {
    if (searchTerm && searchTerm !== lastSearchRef.current) {
      lastSearchRef.current = searchTerm;
      initSearch(type, searchTerm);
    }
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

  // Shared header
  const Header = () => (
    <>
      <Banner />
      <div className="search-heading">
        <h2 className="search-term">{displayTerm}</h2>
      </div>
    </>
  );

  // Loading
  if (loading) {
    return (
      <div className="grid-browse" ref={gridRef}>
        <Header />
        <LoadingSpinner />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="grid-browse" ref={gridRef}>
        <Header />
        <div className="error-container">
          <p className="error-message">Unable to load artworks</p>
          <p className="error-detail">{error}</p>
        </div>
      </div>
    );
  }

  // Empty
  if (artworks.length === 0) {
    return (
      <div className="grid-browse" ref={gridRef}>
        <Header />
        <div className="empty-state">
          <p>No artworks found</p>
        </div>
      </div>
    );
  }

  // Results
  return (
    <div className="grid-browse" ref={gridRef}>
      <Header />

      <div className="thumbnail-grid columns-2">
        {artworks.map((artwork) => (
          <ThumbnailCard key={artwork.id} artwork={artwork} onClick={() => openModal(artwork)} />
        ))}
      </div>

      <div ref={sentinelRef} className="scroll-sentinel" />

      {loadingMore && <InlineLoader />}

      {!hasMore && artworks.length > 0 && (
        <div className="end-message">
          <p>{artworks.length} artwork{artworks.length !== 1 ? 's' : ''} found</p>
        </div>
      )}
    </div>
  );
}
