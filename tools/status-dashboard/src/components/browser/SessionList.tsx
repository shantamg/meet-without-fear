import React, { useEffect, useRef } from 'react';
import { Session } from '../../types';
import { SessionItem } from './SessionItem';

interface SessionListProps {
  sessions: Session[];
  loadingMore?: boolean;
  loadMore?: () => void;
  hasMore?: boolean;
}

export function SessionList({ sessions, loadingMore, loadMore, hasMore }: SessionListProps) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && loadMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loadingMore, loadMore]);

  return (
    <div className="session-list">
      {sessions.map(session => (
        <SessionItem key={session.id} session={session} />
      ))}
      {sessions.length === 0 && <div className="empty-state">No sessions found</div>}

      {/* Loading sentinel and indicator */}
      {(hasMore || loadingMore) && (
        <div ref={observerTarget} className="list-loading-indicator" style={{ textAlign: 'center', padding: '1rem', color: '#666' }}>
          {loadingMore ? 'Loading more sessions...' : 'Load more'}
        </div>
      )}
    </div>
  );
}
