import React from 'react';
import { AblyConnectionStatus } from '../../constants/ably';
import { Session, SessionSummary } from '../../types/session';
import { FormattedPrice } from './FormattedPrice';

interface SessionDetailHeaderProps {
  sessionId: string;
  connectionStatus: AblyConnectionStatus;
  summary: SessionSummary | null;
  session?: Session | null;
}

export function SessionDetailHeader({ sessionId, connectionStatus, summary, session }: SessionDetailHeaderProps) {
  const displayTitle = session?.title || `Session: ${sessionId}`;

  return (
    <header className="detail-header">
      <div className="header-info">
        <h2>{displayTitle}</h2>
        {session?.type === 'INNER_WORK' && <span className="session-tag inner-work">Inner Thoughts</span>}
        <span className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connected' ? '● Live' : '○ Offline'}
        </span>
      </div>
      <div className="total-cost">
        Total Cost: <FormattedPrice value={summary?.totalCost} />
        <span className="token-count" style={{ marginLeft: '8px' }}>
          ({summary?.totalTokens?.toLocaleString()} tokens)
        </span>
      </div>
    </header>
  );
}
