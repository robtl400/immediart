// Reduced-motion preference for JS-driven motion. The global CSS reset in
// index.css only reaches CSS animations; programmatic scrolls read this.
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// The `behavior` for a programmatic scroll: instant under reduced motion.
export const scrollBehavior = () => (prefersReducedMotion() ? 'auto' : 'smooth');
