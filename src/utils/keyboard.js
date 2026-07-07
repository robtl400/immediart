/**
 * Keyboard helpers for ARIA "button"-role elements.
 */

// Returns a keydown handler that activates `fn` on Enter or Space, matching
// native <button> behaviour. Space is prevented from scrolling the page.
export function activateOnKey(fn) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (typeof fn === 'function') fn(e);
    }
  };
}
