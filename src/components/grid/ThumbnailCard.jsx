/**
 * ThumbnailCard Component
 * Displays a single artwork thumbnail in the grid browse view
 */
import { activateOnKey } from '../../utils/keyboard';
import { artworkCaption } from '../../utils/transformers';

export default function ThumbnailCard({ artwork, onClick }) {
  const caption = artworkCaption(artwork);
  return (
    <div
      className="thumbnail-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={caption}
      onKeyDown={activateOnKey(onClick)}
    >
      <img
        src={artwork.imageUrl}
        alt={caption}
        className="thumbnail-image"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
