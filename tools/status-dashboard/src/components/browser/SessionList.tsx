import React from 'react';
import { Session } from '../../types';
import { SessionItem } from './SessionItem';

interface SessionListProps {
  sessions: Session[];
}

export function SessionList({ sessions }: SessionListProps) {
  return (
    <div className="session-list">
      {sessions.map(session => (
        <SessionItem key={session.id} session={session} />
      ))}
      {sessions.length === 0 && <div className="empty-state">No sessions found</div>}
    </div>
  );
}
