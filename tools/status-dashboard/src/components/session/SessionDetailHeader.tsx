import React from 'react';
import { Link } from 'react-router-dom';
import { AblyConnectionStatus } from '../../constants/ably';
import { Session, SessionSummary } from '../../types/session';
import { FormattedPrice } from './FormattedPrice';

interface SessionDetailHeaderProps {
  sessionId: string;
  connectionStatus: AblyConnectionStatus;
  summary: SessionSummary | null;
  session?: Session | null;
}

/** Truncate a CUID to first 8 + last 4 chars with ellipsis */
function truncateId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

/** Derive a human-readable participant name from session data */
function getParticipantTitle(session: Session | null | undefined): string | null {
  if (!session) return null;
  if (session.type === 'INNER_WORK') return 'Inner Thoughts';
  if (session.participants) return session.participants;
  if (session.relationship?.members && session.relationship.members.length > 0) {
    return session.relationship.members
      .map(m => m.user.firstName || m.user.email)
      .join(' & ');
  }
  if (session.title) return session.title;
  // Relationship exists but members are empty = deleted users
  if (session.relationship && (!session.relationship.members || session.relationship.members.length === 0)) {
    return null; // Signals "Deleted Users"
  }
  return null;
}

export function SessionDetailHeader({ sessionId, connectionStatus, summary, session }: SessionDetailHeaderProps) {
  const participantTitle = getParticipantTitle(session);
  const hasParticipantName = participantTitle !== null;
  const stageLabel = session?.stage != null ? `Stage ${session.stage}` : null;
  const statusLabel = session?.status || null;

  return (
    <header className="detail-header">
      <div className="header-info">
        <div>
          <h2>
            {hasParticipantName
              ? participantTitle
              : <span style={{ color: 'var(--text-tertiary, #6b7280)', fontStyle: 'italic' }}>Deleted Users</span>
            }
          </h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>Session {truncateId(sessionId)}</span>
            {statusLabel && (
              <>
                <span style={{ opacity: 0.4 }}>&middot;</span>
                <span>{statusLabel}</span>
              </>
            )}
            {stageLabel && (
              <>
                <span style={{ opacity: 0.4 }}>&middot;</span>
                <span>{stageLabel}</span>
              </>
            )}
          </div>
        </div>
        {session?.type === 'INNER_WORK' && <span className="session-tag inner-work">Inner Thoughts</span>}
        <span className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connected' ? '● Live' : '○ Offline'}
        </span>
      </div>
      <div className="header-actions">
        <Link to={`/sessions/${sessionId}/context`} className="view-context-btn">
          View Context
        </Link>
        <div className="total-cost">
          Total Cost: <FormattedPrice value={summary?.totalCost} />
          <span className="token-count" style={{ marginLeft: '8px' }}>
            ({summary?.totalTokens?.toLocaleString()} tokens)
          </span>
        </div>
      </div>
    </header>
  );
}
