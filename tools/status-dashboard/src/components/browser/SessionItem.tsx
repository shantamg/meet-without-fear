import React from 'react';
import { Link } from 'react-router-dom';
import { Session } from '../../types';
import { formatDateTime } from '../../utils/formatters';

interface SessionItemProps {
  session: Session;
}

export function SessionItem({ session }: SessionItemProps) {
  return (
    <Link to={`/session/${session.id}`} className="session-item">
      <div className="session-info">
        <span className={`status-badge ${session.status.toLowerCase()}`}>
          {session.status}
        </span>
        <span className="session-type">{session.type}</span>
        <span className="session-time">{formatDateTime(session.updatedAt)}</span>
      </div>
      <div className="session-members">
        {session.relationship.members.map((m, i) => (
          <span key={m.id}>
            {i > 0 && ' & '}
            <span className="member-name">{m.user.firstName || m.user.email}</span>
          </span>
        ))}
      </div>
      {session.stats && (
        <div className="session-stats">
          <span className="stat-item" title="Turns">💬 {session.stats.turnCount}</span>
          <span className="stat-item" title="Activities">⚙️ {session.stats.activityCount}</span>
          <span className="stat-item" title="Tokens">🪙 {session.stats.totalTokens.toLocaleString()}</span>
          <span className="stat-item cost" title="Total Cost">
            ${session.stats.totalCost.toFixed(5)}
          </span>
        </div>
      )}
    </Link>
  );
}
