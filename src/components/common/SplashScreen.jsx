import { useEffect, useRef } from 'react';
import flyingMachine from '../../assets/FlyingMachine2_tinted_gold.png';
import './SplashScreen.css';

/**
 * One-time launch animation.
 *
 * A single flying machine flies a full counter-clockwise loop: it ascends from
 * off the bottom-left (large) up through the middle to the top-right, exits and
 * loops over the top of the frame (hidden — where most of the spin happens), then
 * re-enters at the top-left and travels left-to-right, landing upright in the
 * banner's logo slot (a full -360°, so it ends level and matches the logo). The
 * "ImmediArt" wordmark fades in place beside it (no movement), starting early as
 * the ascending flyer passes the middle of the screen.
 *
 * Purely decorative (aria-hidden) and skippable: tap anywhere, and it is not
 * rendered at all under prefers-reduced-motion (gated in App).
 */
const BACKSTOP_MS = 3900; // finish even if the fade's animationend is missed

export default function SplashScreen({ onDone }) {
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    const t = setTimeout(finish, BACKSTOP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="splash-screen"
      role="presentation"
      aria-hidden="true"
      onClick={finish}
      onAnimationEnd={(e) => { if (e.animationName === 'splashFadeOut') finish(); }}
    >
      <div className="splash-crest">
        <img src={flyingMachine} alt="" className="banner-logo splash-flier" draggable={false} />
        <h1 className="banner-title splash-title">ImmediArt</h1>
      </div>
    </div>
  );
}
