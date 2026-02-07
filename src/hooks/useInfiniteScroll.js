import { useEffect, useRef } from 'react';

/**
 * Infinite scroll hook using IntersectionObserver
 */
export default function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  enabled = true,
  rootMargin = '400px',
  root = null  // Pass container ref.current directly
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!enabled || isLoading || !hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { root, rootMargin }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, isLoading, onLoadMore, root, rootMargin]);

  return sentinelRef;
}
