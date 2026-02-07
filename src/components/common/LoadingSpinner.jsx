/**
 * Loading Spinner Components
 * Full-screen spinner for initial load and inline loader for infinite scroll
 */

import './LoadingSpinner.css';
import flyingMachineIcon from '../../assets/FlyingMachine2.png';

export default function LoadingSpinner({ size = 'large', message = '' }) {
  return (
    <div className={`loading-spinner-container ${size}`}>
      <div className="sweep-container">
        <img
          src={flyingMachineIcon}
          alt="Loading"
          className="flying-machine-loader"
        />
      </div>
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
