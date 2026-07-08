/**
 * Loading indicators.
 * - LoadingSpinner: a calm skeleton shown while a full view loads (feed initial
 *   load — usually under the launch splash — and the modal before its artwork
 *   resolves).
 * - InlineLoader: three bouncing dots for infinite-scroll "loading more".
 * The flying machine is no longer a loader; it's the launch splash's signature.
 */

import './LoadingSpinner.css';

export default function LoadingSpinner() {
  return (
    <div className="loading-spinner-container">
      <div className="loading-skeleton skeleton-shimmer" aria-hidden="true" />
      {/* Real text inside the live region so screen readers announce the wait
          (an empty role=status named only by aria-label is not reliably read). */}
      <span className="sr-only" role="status">Loading…</span>
    </div>
  );
}

export function InlineLoader() {
  return (
    <div className="inline-loader">
      <div className="dot"></div>
      <div className="dot"></div>
      <div className="dot"></div>
    </div>
  );
}
