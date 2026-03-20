import './SkeletonCard.css';

export default function SkeletonCard({ variant = 'feed' }) {
  if (variant === 'grid') {
    return <div className="skeleton-card skeleton-grid skeleton-shimmer" />;
  }

  return (
    <article className="skeleton-card skeleton-feed">
      <div className="skeleton-image skeleton-shimmer" />
      <div className="skeleton-actions skeleton-shimmer" />
      <div className="skeleton-text">
        <div className="skeleton-line skeleton-shimmer" />
        <div className="skeleton-line skeleton-line-short skeleton-shimmer" />
      </div>
    </article>
  );
}
