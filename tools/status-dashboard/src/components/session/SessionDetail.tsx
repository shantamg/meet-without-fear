import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionActivity } from '../../hooks/useSessionActivity';
import { SessionDetailHeader } from './SessionDetailHeader';
import { SplitView } from './SplitView';
import { TurnView } from './TurnView';
import { SessionCostTab } from './SessionCostTab';
import { SessionPromptsTab } from './SessionPromptsTab';

type TabId = 'timeline' | 'context' | 'cost' | 'prompts';

function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('timeline');

  const {
    loading,
    error,
    summary,
    connectionStatus,
    users,
    turns,
    activities,
    initiatorTurns,
    inviteeTurns,
    hasTwoUsers,
    sessionData,
  } = useSessionActivity(sessionId);

  if (loading) return <div className="loading">Loading Brain Activity...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const handleTabClick = (tab: TabId) => {
    if (tab === 'context') {
      navigate(`/sessions/${sessionId}/context`);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="session-detail">
      <SessionDetailHeader
        sessionId={sessionId || ''}
        connectionStatus={connectionStatus}
        summary={summary}
        session={sessionData}
      />

      {/* Sub-tab navigation */}
      <div className="session-tabs">
        {(['timeline', 'context', 'cost', 'prompts'] as TabId[]).map((tab) => (
          <button
            key={tab}
            className={`session-tab ${activeTab === tab && tab !== 'context' ? 'active' : ''}`}
            onClick={() => handleTabClick(tab)}
          >
            {tab === 'timeline' && 'Timeline'}
            {tab === 'context' && 'Context →'}
            {tab === 'cost' && 'Cost'}
            {tab === 'prompts' && 'Prompts'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'timeline' && (
        <>
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
        </>
      )}

      {activeTab === 'cost' && (
        <SessionCostTab activities={activities} summary={summary} />
      )}

      {activeTab === 'prompts' && (
        <SessionPromptsTab activities={activities} sessionId={sessionId || ''} />
      )}
    </div>
  );
}

export default SessionDetail;
