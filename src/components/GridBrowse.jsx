import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './GridBrowse.css';
import { useGridBrowse } from '../context/GridBrowseContext';
import { useArtworkModal } from '../context/ArtworkModalContext';
import Banner from './Banner';
import LoadingSpinner, { InlineLoader } from './LoadingSpinner';

export default function GridBrowse({ type }) {
  const params = useParams();
  // Decode URL-encoded parameters
  const rawTerm = type === 'artist' ? params.artistName : params.tagName;
  const searchTerm = rawTerm ? decodeURIComponent(rawTerm) : '';

  const {
    artworks,
    loading,
    loadingMore,
    error,
    hasMore,
    searchTerm: currentSearchTerm,
    initSearch,
    loadMore
  } = useGridBrowse();
  const { openModal } = useArtworkModal();

  const gridRef = useRef(null);
  const sentinelRef = useRef(null);
  const lastSearchRef = useRef('');

  // Initialize search when component mounts or search term changes
  // Use ref to prevent StrictMode double-invocation
  useEffect(() => {
    if (searchTerm && searchTerm !== lastSearchRef.current) {
      lastSearchRef.current = searchTerm;
      initSearch(type, searchTerm);
    }
  }, [type, searchTerm, initSearch]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    const grid = gridRef.current;
    if (!sentinel || !grid) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      {
        root: grid,
        rootMargin: '400px'
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadingMore, loadMore]);

  // Format display term
  const displayTerm = type === 'artist'
    ? `@${searchTerm.toLowerCase().replace(/\s+/g, '_')}`
    : `#${searchTerm.replace(/\s+/g, '')}`;

  // Always use 2 columns for consistent, lighter loading
  const columnCount = 2;

  // Loading state
  if (loading) {
    return (
      <div className="grid-browse" ref={gridRef}>
        <Banner />
        <div className="search-heading">
          <h2 className="search-term">{displayTerm}</h2>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="grid-browse" ref={gridRef}>
        <Banner />
        <div className="search-heading">
          <h2 className="search-term">{displayTerm}</h2>
        </div>
        <div className="error-container">
          <p className="error-message">Unable to load artworks</p>
          <p className="error-detail">{error}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (artworks.length === 0 && !loading) {
    return (
      <div className="grid-browse" ref={gridRef}>
        <Banner />
        <div className="search-heading">
          <h2 className="search-term">{displayTerm}</h2>
        </div>
        <div className="empty-state">
          <p>No artworks found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-browse" ref={gridRef}>
      <Banner />
      <div className="search-heading">
        <h2 className="search-term">{displayTerm}</h2>
      </div>

      <div className={`thumbnail-grid columns-${columnCount}`}>
        {artworks.map((artwork) => (
          <ThumbnailCard key={artwork.id} artwork={artwork} onClick={() => openModal(artwork)} />
        ))}
      </div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="scroll-sentinel" />

      {/* Loading more indicator */}
      {loadingMore && <InlineLoader />}

      {/* End of results */}
      {!hasMore && artworks.length > 0 && (
        <div className="end-message">
          <p>{artworks.length} artwork{artworks.length !== 1 ? 's' : ''} found</p>
        </div>
      )}
    </div>
  );
}

function ThumbnailCard({ artwork, onClick }) {
  return (
    <div
      className="thumbnail-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <img
        src={artwork.imageUrl}
        alt={`${artwork.title} by ${artwork.artistName}`}
        className="thumbnail-image"
        loading="lazy"
      />
    </div>
  );
}
