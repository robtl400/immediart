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
  rootRef = null  // Ref object for the scroll container; read at effect time so it's populated after mount
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
      { root: rootRef?.current ?? null, rootMargin }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, isLoading, onLoadMore, rootRef, rootMargin]);

  return sentinelRef;
}
