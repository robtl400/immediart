/**
 * ThumbnailCard Component
 * Displays a single artwork thumbnail in the grid browse view
 */
import { activateOnKey } from '../../utils/keyboard';

export default function ThumbnailCard({ artwork, onClick }) {
  return (
    <div
      className="thumbnail-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={artwork.artistName ? `${artwork.title} by ${artwork.artistName}` : artwork.title}
      onKeyDown={activateOnKey(onClick)}
    >
      <img
        src={artwork.imageUrl}
        alt={artwork.artistName ? `${artwork.title} by ${artwork.artistName}` : artwork.title}
        className="thumbnail-image"
        loading="lazy"
      />
    </div>
  );
}
