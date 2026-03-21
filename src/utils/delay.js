/**
 * Async delay utilities
 */

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const addJitter = (ms) => ms + Math.floor(Math.random() * ms * 0.3);

/** Delay that cancels immediately if the AbortSignal fires */
export function delayOrAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}
