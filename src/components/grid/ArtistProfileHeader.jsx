import { useMemo } from 'react';
import { formatArtistUsername } from '../../utils/transformers';

export default function ArtistProfileHeader({ artistName, artworks }) {
  const repArtwork = artworks.find(a => a.artistBio?.trim()) || null;
  const artistBio = repArtwork?.artistBio?.trim() || '';

  // Search all artworks for ULAN — bio and ULAN may be on different artworks
  const linkInBio = (() => {
    const ulan = artworks.find(a => a.artistULAN_URL)?.artistULAN_URL;
    if (ulan) return ulan;
    if (repArtwork?.objectURL) return repArtwork.objectURL;
    return `https://www.metmuseum.org/search-results#!/search?q=${encodeURIComponent(artistName)}`;
  })();

  const highlightCount = artworks.filter(a => a.isHighlight).length;
  const username = formatArtistUsername(artistName);

  // Fallback descriptor — most-frequent department in the loaded batch
  const fallbackDesc = useMemo(() => {
    if (artistBio) return null;
    const freq = new Map();
    artworks.forEach(a => a.department && freq.set(a.department, (freq.get(a.department) ?? 0) + 1));
    if (!freq.size) return null;
    const top = [...freq.entries()].reduce((a, b) => b[1] > a[1] ? b : a)[0];
    return `Works in the ${top} collection`;
  }, [artworks, artistBio]);

  return (
    <div className="artist-profile-header">
      <div className="profile-identity">
        <span className="profile-username">{username}</span>
        {highlightCount > 0 && (
          <span className="profile-verified" aria-label="Museum Highlight">✓</span>
        )}
      </div>

      <p className="profile-display-name">{artistName}</p>

      {artistBio
        ? <p className="profile-bio">{artistBio}</p>
        : fallbackDesc
          ? <p className="profile-bio profile-bio--fallback">{fallbackDesc}</p>
          : null
      }

      <a
        href={linkInBio}
        target="_blank"
        rel="noopener noreferrer"
        className="profile-link-in-bio"
      >
        Link in bio →
      </a>

      <div className="profile-stats">
        <span className="profile-stat">
          <strong>{artworks.length}</strong> artwork{artworks.length !== 1 ? 's' : ''} loaded
        </span>
        {highlightCount > 0 && (
          <span className="profile-stat">
            <strong>{highlightCount}</strong> highlight{highlightCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
