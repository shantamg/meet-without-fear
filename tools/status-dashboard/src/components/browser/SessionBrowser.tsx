import React from 'react';
import { useSessions } from '../../hooks/useSessions';
import { SessionBrowserHeader } from './SessionBrowserHeader';
import { SessionList } from './SessionList';

function SessionBrowser() {
  const { sessions, loading, error, refetch, connectionStatus } = useSessions();

  if (loading) return <div className="loading">Loading sessions...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="session-browser">
      <SessionBrowserHeader 
        connectionStatus={connectionStatus} 
        onRefresh={refetch} 
      />
      <SessionList sessions={sessions} />
    </div>
  );
}

export default SessionBrowser;
