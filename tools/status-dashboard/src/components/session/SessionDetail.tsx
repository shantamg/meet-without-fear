import React from 'react';
import { useParams } from 'react-router-dom';
import { useSessionActivity } from '../../hooks/useSessionActivity';
import { SessionDetailHeader } from './SessionDetailHeader';
import { SplitView } from './SplitView';
import { TurnView } from './TurnView';

function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  
  const {
    loading,
    error,
    summary,
    connectionStatus,
    users,
    turns,
    initiatorTurns,
    inviteeTurns,
    hasTwoUsers,
  } = useSessionActivity(sessionId);

  if (loading) return <div className="loading">Loading Brain Activity...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="session-detail">
      <SessionDetailHeader
        sessionId={sessionId || ''}
        connectionStatus={connectionStatus}
        summary={summary}
      />

      {hasTwoUsers && users.initiator && users.invitee ? (
        <SplitView
          initiator={users.initiator}
          invitee={users.invitee}
          initiatorTurns={initiatorTurns}
          inviteeTurns={inviteeTurns}
        />
      ) : (
        <div className="turns-feed">
          {turns.map(turn => (
            <TurnView key={turn.id} turn={turn} userName={users.initiator?.name || 'User'} />
          ))}
        </div>
      )}
    </div>
  );
}

export default SessionDetail;
