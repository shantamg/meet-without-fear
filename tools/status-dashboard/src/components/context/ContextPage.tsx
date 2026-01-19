import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useContextBundle } from '../../hooks/useContextBundle';
import { ContextColumn } from './ContextColumn';

/**
 * ContextPage displays the assembled AI context bundle for a session.
 * Shows side-by-side view for partner sessions (two users) or single column for inner thoughts.
 */
function ContextPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { contextData, loading, error, connectionStatus, refetch } = useContextBundle(sessionId);

  if (loading) {
    return (
      <div className="context-page">
        <div className="context-header">
          <Link to={`/session/${sessionId}`} className="back-link">&larr; Back to Session</Link>
          <h2>Context Bundle</h2>
        </div>
        <div className="loading">Loading context...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="context-page">
        <div className="context-header">
          <Link to={`/session/${sessionId}`} className="back-link">&larr; Back to Session</Link>
          <h2>Context Bundle</h2>
        </div>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (!contextData || contextData.users.length === 0) {
    return (
      <div className="context-page">
        <div className="context-header">
          <Link to={`/session/${sessionId}`} className="back-link">&larr; Back to Session</Link>
          <h2>Context Bundle</h2>
        </div>
        <div className="empty-state">
          No context assembled yet. Context will appear as conversation progresses.
        </div>
      </div>
    );
  }

  const isSoloSession = contextData.sessionType === 'inner_thoughts' || contextData.users.length === 1;

  return (
    <div className="context-page">
      <div className="context-header">
        <Link to={`/session/${sessionId}`} className="back-link">&larr; Back to Session</Link>
        <h2>Context Bundle</h2>
        <div className="context-meta">
          <span className={`connection-status ${connectionStatus}`}>
            {connectionStatus === 'connected' ? 'Live' : connectionStatus}
          </span>
          <span className="assembled-at">
            Assembled at {new Date(contextData.assembledAt).toLocaleTimeString()}
          </span>
          <button onClick={refetch} className="refresh-btn">Refresh</button>
        </div>
      </div>

      <div className={`context-columns ${isSoloSession ? 'solo' : 'partner'}`}>
        {contextData.users.map((userData) => (
          <ContextColumn
            key={userData.userId}
            userId={userData.userId}
            userName={userData.userName}
            context={userData.context}
          />
        ))}
      </div>
    </div>
  );
}

export default ContextPage;
