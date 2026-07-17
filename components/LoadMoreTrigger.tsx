'use client';

import React, { useEffect, useRef } from 'react';

interface LoadMoreTriggerProps {
  onLoadMore: () => void;
  loading: boolean;
  hasMore: boolean;
  children?: React.ReactNode;
}

export default function LoadMoreTrigger({ onLoadMore, loading, hasMore, children }: LoadMoreTriggerProps) {
  const triggerRef = useRef<HTMLDivElement>(null);

  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: '200px' } // Pre-load before it comes into view
    );

    const currentRef = triggerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loading]);

  if (!hasMore) return null;

  return (
    <div ref={triggerRef} style={{ textAlign: 'center', marginTop: 32, minHeight: 40, width: '100%' }}>
      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        children || <div style={{ color: 'var(--text-muted)' }}>Scroll for more</div>
      )}
    </div>
  );
}
