import { useState, useEffect } from 'react';
import './DiscoveryFeed.css';
import flyingMachineIcon from '../assets/FlyingMachine2.png';

export default function DiscoveryFeed() {
  const [isLiked, setIsLiked] = useState(false);
  const [isLandscape, setIsLandscape] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Placeholder artwork data - will be replaced with Met API data
  const artwork = {
    imageUrl: 'https://images.metmuseum.org/CRDImages/ep/original/DT1567.jpg',
    artistName: 'Vincent van Gogh',
    title: 'Wheat Field with Cypresses',
    medium: 'Oil on canvas',
    culture: 'Dutch',
    period: 'Post-Impressionist period',
    description: 'This landscape showcases swirling brushstrokes typical of the artist\'s later work.',
    date: '1889',
    department: 'European Paintings',
    gallery: '822',
    creditLine: 'Purchase, The Annenberg Foundation Gift, 1993',
    tags: ['landscapes', 'countryside', 'nature', 'PostImpressionism']
  };

  // Format artist name without spaces (Instagram username style)
  const formatArtistName = (name) => {
    return name.replace(/\s+/g, '');
  };

  // Handle image load to detect orientation
  const handleImageLoad = (e) => {
    const img = e.target;
    setIsLandscape(img.naturalWidth >= img.naturalHeight);
    setImageLoaded(true);
  };

  // Handle like button click
  const handleLike = () => {
    setIsLiked(!isLiked);
  };

  // Handle share button click (placeholder for now)
  const handleShare = () => {
    console.log('Share clicked - functionality to be implemented');
  };

  // Handle hashtag click (placeholder for navigation)
  const handleHashtagClick = (tag) => {
    console.log(`Hashtag #${tag} clicked - will navigate to grid view`);
  };

  return (
    <div className="discovery-feed">
      {/* Banner Section */}
      <header className="banner">
        <h1 className="banner-title">ImmediArt</h1>
      </header>

      {/* Artwork Image Container */}
      <div className={`image-container ${isLandscape ? 'landscape' : 'portrait'}`}>
        <img
          src={artwork.imageUrl}
          alt={`${artwork.title} by ${artwork.artistName}`}
          className="artwork-image"
          onLoad={handleImageLoad}
        />
        {!imageLoaded && <div className="image-placeholder" />}
      </div>

      {/* Action Buttons Row */}
      <div className="action-buttons">
        <button
          className={`action-btn like-btn ${isLiked ? 'liked' : ''}`}
          onClick={handleLike}
          aria-label={isLiked ? 'Unlike' : 'Like'}
        >
          <span className="icon heart-icon">
            {isLiked ? '♥' : '♡'}
          </span>
          <span className="btn-label">Like</span>
        </button>

        <button
          className="action-btn share-btn"
          onClick={handleShare}
          aria-label="Share"
        >
          <img
            src={flyingMachineIcon}
            alt="Share"
            className="icon share-icon"
          />
          <span className="btn-label">Share</span>
        </button>
      </div>

      {/* Text Information Box */}
      <div className="text-info">
        <p className="artwork-description">
          <span className="artist-name">{formatArtistName(artwork.artistName)}</span>
          {' '}
          {artwork.title}. {artwork.medium}. {artwork.culture}, {artwork.period}. {artwork.description}
        </p>

        <p className="artwork-date">{artwork.date}</p>

        <div className="hashtags">
          {artwork.tags.map((tag, index) => (
            <span
              key={index}
              className="hashtag"
              onClick={() => handleHashtagClick(tag)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleHashtagClick(tag)}
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Comment Section - Satirical Metadata */}
      <div className="comment-section">
        <div className="comment">
          <span className="comment-username">@{artwork.department.replace(/\s+/g, '')}Dept</span>
          {' '}
          <span className="comment-text">
            Currently on display in Gallery {artwork.gallery} - come visit us on the second floor!
          </span>
        </div>

        <div className="comment">
          <span className="comment-username">@TheMetMuseum</span>
          {' '}
          <span className="comment-text">
            {artwork.creditLine} 🎨
          </span>
        </div>
      </div>
    </div>
  );
}
