import { useState, useCallback, useEffect, useRef } from 'react';
import { requestManager } from '../services/requestManager';

// A budget wait shorter than this is invisible behind the loader; longer, and
// the view says "resuming in Ns" instead of showing a dead spinner.
const THROTTLE_NOTICE_MS = 1500;
// Slack after the countdown before acting on it: the breaker's own timer
// flips it at the same instant, and the retry must land on the far side.
const THROTTLE_END_GRACE_MS = 250;
// An OPEN breaker with nothing left on its clock (a background tab's clamped
// timers) counts this long: its timer is about to flip it.
const BREAKER_FLIP_FALLBACK_MS = 1000;

/**
 * The "resuming in Ns" state for a paginated view: a timestamp until which
 * the request layer is deliberately waiting (budget spent / Retry-After hold /
 * Met ban due to lift). Views count it down; `onExpire` runs when it ends.
 *
 *   noteBudgetWait()  — sample the gate wait the next dispatch would sit through
 *   noteBreakerWait() — surface an OPEN breaker; returns whether one was noted
 */
export default function useThrottleCountdown(onExpire) {
  const [throttledUntil, setThrottledUntil] = useState(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const noteBudgetWait = useCallback(() => {
    // The manager reports an absolute instant, so repeated samples of the
    // same wait are the same state value and cause no re-render.
    const at = requestManager.nextDispatchAt;
    setThrottledUntil(at - Date.now() > THROTTLE_NOTICE_MS ? at : null);
  }, []);

  const noteBreakerWait = useCallback(() => {
    let ms = requestManager.breakerWaitMs;
    if (ms <= 0) {
      if (requestManager.state !== 'OPEN') return false;
      ms = BREAKER_FLIP_FALLBACK_MS;
    }
    setThrottledUntil(Date.now() + ms);
    return true;
  }, []);

  useEffect(() => {
    if (throttledUntil == null) return;
    const t = setTimeout(() => {
      setThrottledUntil(null);
      onExpireRef.current?.();
    }, Math.max(0, throttledUntil - Date.now()) + THROTTLE_END_GRACE_MS);
    return () => clearTimeout(t);
  }, [throttledUntil]);

  return { throttledUntil, setThrottledUntil, noteBudgetWait, noteBreakerWait };
}
