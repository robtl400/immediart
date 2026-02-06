/**
 * Loading Spinner Components
 * Full-screen spinner for initial load and inline loader for infinite scroll
 */

import './LoadingSpinner.css';

export default function LoadingSpinner({ size = 'large', message = 'Art is loading...' }) {
  return (
    <div className={`loading-spinner-container ${size}`}>
      <div className="spinner"></div>
      {message && <p className="loading-message">{message}</p>}
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
