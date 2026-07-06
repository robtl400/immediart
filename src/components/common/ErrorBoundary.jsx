import { Component } from 'react';

/**
 * Catches render errors anywhere in the tree and shows a recoverable
 * fallback instead of a white screen (e.g. a malformed /artist/%E0 URL).
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ImmediArt] Render error:', error, info?.componentStack);
  }

  handleReset = () => {
    // A render error can be caused by the current URL (bad deep link),
    // so recover to the feed rather than re-rendering the same broken tree.
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-page app-frame">
          <div className="error-container" role="alert">
            <p className="error-message">Something went wrong</p>
            <p className="error-detail">An unexpected error occurred.</p>
            <button className="retry-button" onClick={this.handleReset}>
              Back to the feed
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
