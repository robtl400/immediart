import { useEffect, useState } from 'react';

/**
 * "Slowing down" notice for the two throttle states the request layer
 * creates on purpose: the rolling request budget is spent (the next batch is
 * queued until the window slides) or the circuit breaker is open after a Met
 * ban (a retry is scheduled for when it is due to lift). Either way the app
 * is not stuck — it says so, counts down, and resumes on its own instead of
 * showing a dead spinner or a "Try again" that fails on the spot.
 */
export default function ThrottleNotice({ until }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(1, Math.ceil((until - now) / 1000));
  // The live sentence stays constant so a screen reader announces it once;
  // the ticking number is visual only (it would otherwise re-announce every
  // second for the whole wait).
  return (
    <p className="throttle-notice" role="status">
      Slowing down to respect the Met's limits — resuming shortly
      <span aria-hidden="true"> ({seconds}s)</span>
    </p>
  );
}
