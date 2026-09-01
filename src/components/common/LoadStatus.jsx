import ThrottleNotice from './ThrottleNotice';

/**
 * What a view shows when a fetch is not delivering: a deliberate wait on the
 * Met's limits (a countdown) or a failure (the error and a retry). The wait
 * wins over the error, because while the countdown runs the retry would fail
 * on the spot. Renders nothing when there is neither.
 *
 *   inline — below existing results (a load-more failure) rather than as the
 *            view's whole body; `title` is the full-screen heading.
 */
export default function LoadStatus({ error, throttledUntil, onRetry, title = 'Unable to load artworks', inline = false }) {
  if (throttledUntil) return <ThrottleNotice until={throttledUntil} />;
  if (!error) return null;
  if (inline) {
    return (
      <div className="inline-error" role="status">
        <p>{error}</p>
        <button className="retry-button" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  return (
    <div className="error-container">
      <p className="error-message">{title}</p>
      <p className="error-detail">{error}</p>
      <button className="retry-button" onClick={onRetry}>Try again</button>
    </div>
  );
}
