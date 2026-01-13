import React from 'react';
import { AblyConnectionStatus } from '../../constants/ably';

interface SessionBrowserHeaderProps {
  connectionStatus: AblyConnectionStatus;
  onRefresh: () => void;
}

export function SessionBrowserHeader({ connectionStatus, onRefresh }: SessionBrowserHeaderProps) {
  return (
    <header className="browser-header">
      <div className="header-left">
        <h2>Recent Sessions</h2>
        <span className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connected' ? '● Live' : '○ Offline'}
        </span>
      </div>
      <button onClick={onRefresh} className="refresh-btn">Refresh</button>
    </header>
  );
}
