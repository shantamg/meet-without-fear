import React from 'react';
import { AblyConnectionStatus } from '../../constants/ably';
import { SessionSummary } from '../../types/session';
import { FormattedPrice } from './FormattedPrice';

interface SessionDetailHeaderProps {
  sessionId: string;
  connectionStatus: AblyConnectionStatus;
  summary: SessionSummary | null;
}

export function SessionDetailHeader({ sessionId, connectionStatus, summary }: SessionDetailHeaderProps) {
  return (
    <header className="detail-header">
      <div className="header-info">
        <h2>Session: {sessionId}</h2>
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
