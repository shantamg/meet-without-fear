
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Ably from 'ably';
import { BrainActivity, ActivityType } from '../types';
import { parseJsonSafely } from '../utils/json';

const ablyKey = import.meta.env.VITE_ABLY_KEY;

interface Turn {
  id: string;
  activities: BrainActivity[];
  timestamp: string;
  userId?: string;
  userMessageContent?: string;
}

interface UserInfo {
  id: string;
  name: string;
  isInitiator: boolean;
}

function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activities, setActivities] = useState<BrainActivity[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [ablyStatus, setAblyStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');

  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);

  // Extract users from session data
  const users = React.useMemo((): { initiator: UserInfo | null; invitee: UserInfo | null } => {
    if (!sessionData?.relationship?.members) {
      return { initiator: null, invitee: null };
    }

    const members = sessionData.relationship.members;

    // Sort by createdAt to determine initiator (first to join) vs invitee
    const sortedMembers = [...members].sort((a: any, b: any) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const initiatorMember = sortedMembers[0];
    const inviteeMember = sortedMembers[1];

    const initiator = initiatorMember ? {
      id: initiatorMember.userId,
      name: initiatorMember.user?.firstName || initiatorMember.user?.name || 'User 1',
      isInitiator: true,
    } : null;

    const invitee = inviteeMember ? {
      id: inviteeMember.userId,
      name: inviteeMember.user?.firstName || inviteeMember.user?.name || 'User 2',
      isInitiator: false,
    } : null;

    return { initiator, invitee };
  }, [sessionData]);

  // Group activities into turns
  const turns = React.useMemo(() => {
    const groups: Turn[] = [];
    const turnMap = new Map<string, Turn>();

    activities.forEach(activity => {
      let turnId = activity.turnId;
      // If no turnId, try to find one in metadata
      if (!turnId && activity.metadata?.turnId) {
        turnId = activity.metadata.turnId;
      }
      if (!turnId) {
        // Fallback for system events or orphans
        turnId = `orphan-${Math.floor(new Date(activity.createdAt).getTime() / 60000)}`; // Group by minute
      }

      if (!turnMap.has(turnId)) {
        const newTurn: Turn = {
          id: turnId,
          activities: [],
          timestamp: activity.createdAt
        };
        turnMap.set(turnId, newTurn);
        groups.push(newTurn);
      }

      const turn = turnMap.get(turnId)!;
      turn.activities.push(activity);

      // Try to determine userId for the turn
      if (!turn.userId) {
        if (activity.metadata?.userId) {
          turn.userId = activity.metadata.userId;
        } else if (activity.turnId && activity.turnId.includes('-')) {
          // Try to extract UUID segment from turnId (session-USERID-suffix)
          const parts = activity.turnId.split('-');
          if (parts.length >= 2) {
            // Check if any part matches user IDs
            if (users.initiator && activity.turnId.includes(users.initiator.id)) turn.userId = users.initiator.id;
            else if (users.invitee && activity.turnId.includes(users.invitee.id)) turn.userId = users.invitee.id;
          }
        }
      }
    });

    // Sort turns by timestamp descending (newest first)
    const sortedGroups = groups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Match messages to turns
    if (messages.length > 0) {
      const usedMessageIds = new Set<string>();

      // First pass: Try to assign messages to "Real" turns (with valid IDs)
      sortedGroups.forEach(turn => {
        if (turn.id.startsWith('orphan-')) return;

        const turnStart = new Date(turn.timestamp).getTime();

        const candidates = messages.filter(m => {
          if (usedMessageIds.has(m.id)) return false;
          const msgTime = new Date(m.timestamp).getTime();
          return Math.abs(msgTime - turnStart) < 30000;
        });

        if (candidates.length > 0) {
          const closest = candidates.reduce((prev, curr) => {
            const prevDiff = Math.abs(new Date(prev.timestamp).getTime() - turnStart);
            const currDiff = Math.abs(new Date(curr.timestamp).getTime() - turnStart);
            return (currDiff < prevDiff) ? curr : prev;
          });
          turn.userMessageContent = closest.content;
          usedMessageIds.add(closest.id);
        }
      });

      // Second pass: Assign remaining messages to Orphan turns
      sortedGroups.forEach(turn => {
        if (!turn.id.startsWith('orphan-')) return;

        const turnStart = new Date(turn.timestamp).getTime();

        const candidates = messages.filter(m => {
          if (usedMessageIds.has(m.id)) return false;
          const msgTime = new Date(m.timestamp).getTime();
          return Math.abs(msgTime - turnStart) < 30000;
        });

        if (candidates.length > 0) {
          const closest = candidates.reduce((prev, curr) => {
            const prevDiff = Math.abs(new Date(prev.timestamp).getTime() - turnStart);
            const currDiff = Math.abs(new Date(curr.timestamp).getTime() - turnStart);
            return (currDiff < prevDiff) ? curr : prev;
          });
          turn.userMessageContent = closest.content;
          usedMessageIds.add(closest.id);
        }
      });
    }

    return sortedGroups;
  }, [activities, users, messages]);

  // Split turns by user
  const { initiatorTurns, inviteeTurns } = React.useMemo(() => {
    const iTurns: Turn[] = [];
    const invTurns: Turn[] = [];

    turns.forEach(turn => {
      if (users.initiator && turn.userId === users.initiator.id) {
        iTurns.push(turn);
      } else if (users.invitee && turn.userId === users.invitee.id) {
        invTurns.push(turn);
      } else {
        // Unassigned - maybe duplicate to both or put in a specific list?
        // For now, put in initiator as default column or check if it's system (orphan)
        iTurns.push(turn);
      }
    });

    return { initiatorTurns: iTurns, inviteeTurns: invTurns };
  }, [turns, users]);


  // Auto-scroll logic (same as before)
  const prevTurnCountRef = useRef({ initiator: 0, invitee: 0 });
  const isInitialLoadRef = useRef(true);
  useEffect(() => {
    if (isInitialLoadRef.current) {
      prevTurnCountRef.current = { initiator: initiatorTurns.length, invitee: inviteeTurns.length };
      isInitialLoadRef.current = false;
      return;
    }
    const timeoutId = setTimeout(() => {
      if (initiatorTurns.length > prevTurnCountRef.current.initiator) {
        leftColumnRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (inviteeTurns.length > prevTurnCountRef.current.invitee) {
        rightColumnRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      prevTurnCountRef.current = { initiator: initiatorTurns.length, invitee: inviteeTurns.length };
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [initiatorTurns.length, inviteeTurns.length]);


  // Data fetching
  const fetchActivities = async () => {
    try {
      const res = await fetch(`/api/brain/activity/${sessionId}`);
      if (!res.ok) throw new Error(res.statusText);
      const json = await res.json();
      if (json.success) {
        setActivities(json.data.activities);
        setMessages(json.data.messages || []);
        setSummary(json.data.summary);
        // Also fetch session data if not available
        if (!sessionData) {
          // We might need a separate call for session details if not included in activity
          // But we can infer some things or fetch /api/brain/sessions and find it
          // For now let's assume we can fetch session info or stick with what we have
          // Actually the previous implementation fetched /logs which returned { logs, session }
          // Using /api/brain/sessions is an option, or we can add include to /activity endpoint
          // Let's call /api/brain/sessions/ID specifically? No valid endpoint yet.
          // Just fetch all sessions and find one (inefficient but works for now)
          const sessionsRes = await fetch('/api/brain/sessions');
          const sessionsJson = await sessionsRes.json();
          if (sessionsJson.success) {
            const found = sessionsJson.data.sessions.find((s: any) => s.id === sessionId);
            if (found) setSessionData(found);
          }
        }
        setError(null);
      } else {
        setError('API Error');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();

    if (!ablyKey) {
      setAblyStatus('error');
      return;
    }

    const client = new Ably.Realtime(ablyKey);
    const channel = client.channels.get('ai-audit-stream');

    client.connection.on('connected', () => setAblyStatus('connected'));
    client.connection.on('disconnected', () => setAblyStatus('disconnected'));

    // Listen for brain-activity events
    channel.subscribe('brain-activity', (msg) => {
      const activity = msg.data as BrainActivity;
      if (activity.sessionId === sessionId) {
        setActivities(prev => {
          // Check if update or new
          const index = prev.findIndex(p => p.id === activity.id);
          if (index >= 0) {
            const newArr = [...prev];
            newArr[index] = activity;
            return newArr;
          }
          return [...prev, activity];
        });
        // Update summary roughly
        if (activity.cost) {
          setSummary((prev: any) => ({ ...prev, totalCost: (prev?.totalCost || 0) + activity.cost }));
        }
      }
    });

    // Listen for new messages
    channel.subscribe('new-message', (msg) => {
      const message = msg.data;
      // Only process USER messages for the main chat view
      // AI messages will be handled by seeing the response activities, 
      // or if we want to show them purely from DB, they are not USER messages.
      if (message.sessionId === sessionId && message.role === 'USER') {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    });

    return () => {
      channel.unsubscribe();
      client.close();
    };
  }, [sessionId]);

  if (loading) return <div className="loading">Loading Brain Activity...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const hasTwoUsers = users.initiator && users.invitee;

  return (
    <div className="session-detail">
      <header className="detail-header">
        <div className="header-info">
          <h2>Session: {sessionId}</h2>
          <span className={`connection-status ${ablyStatus}`}>
            {ablyStatus === 'connected' ? '● Live' : '○ Offline'}
          </span>
        </div>
        <div className="total-cost">
          Total Cost: <FormattedPrice value={summary?.totalCost} />
          <span className="token-count" style={{ marginLeft: '8px' }}>({summary?.totalTokens?.toLocaleString()} tokens)</span>
        </div>
      </header>

      {hasTwoUsers ? (
        <div className="split-view-container">
          {/* Left Column - Initiator */}
          <div className="user-column initiator-column">
            <div className="column-header">
              <span className="user-avatar">👤</span>
              <span className="user-name">{users.initiator?.name}</span>
              <span className="user-role">Initiator</span>
            </div>
            <div className="column-turns" ref={leftColumnRef}>
              {initiatorTurns.map(turn => (
                <TurnView key={turn.id} turn={turn} userName={users.initiator?.name || 'User'} />
              ))}
              {initiatorTurns.length === 0 && <div className="empty-column">No activity</div>}
            </div>
          </div>

          {/* Right Column - Invitee */}
          <div className="user-column invitee-column">
            <div className="column-header">
              <span className="user-avatar">👤</span>
              <span className="user-name">{users.invitee?.name}</span>
              <span className="user-role">Invitee</span>
            </div>
            <div className="column-turns" ref={rightColumnRef}>
              {inviteeTurns.map(turn => (
                <TurnView key={turn.id} turn={turn} userName={users.invitee?.name || 'User'} />
              ))}
              {inviteeTurns.length === 0 && <div className="empty-column">No activity</div>}
            </div>
          </div>
        </div>
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

function TurnView({ turn, userName }: { turn: Turn, userName: string }) {
  // Sort activities by time
  const sortedActivities = [...turn.activities].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Extract high-level summaries
  const firstActivity = sortedActivities[0];
  const lastActivity = sortedActivities[sortedActivities.length - 1];

  const userMessage = React.useMemo(() => {
    // 0. Use canonical message from DB if matched
    if (turn.userMessageContent) return turn.userMessageContent;

    // Helper to check if activity is internal detection/planning
    const isInternal = (act: BrainActivity) => {
      const parsedInput = act.input ? deepParse(act.input) : null;
      const op = act.metadata?.operation || (parsedInput as any)?.operation;
      return op === 'memory-detection' || op === 'retrieval-planning' || op === 'intent-detection';
    };

    // 1. Try to find the main orchestrator activity
    const mainActivity = sortedActivities.find(a =>
      (a.metadata?.operation === 'orchestrator-response') ||
      (a.metadata?.operation === 'converse-sonnet')
    );

    // 2. Fallback: Find first non-internal activity (e.g. if main failed or not started yet)
    // 3. Fallback: First activity (if all else fails)
    const targetActivity = mainActivity || sortedActivities.find(a => !isInternal(a)) || sortedActivities[0];

    if (!targetActivity?.input) return null;

    const parsed = deepParse(targetActivity.input);
    if (parsed.messages && Array.isArray(parsed.messages)) {
      const userMsgs = parsed.messages.filter((m: any) => m.role === 'user');
      if (userMsgs.length > 0) {
        let content = userMsgs[userMsgs.length - 1].content;
        // Clean up context injection if present to show only user's typed message
        if (typeof content === 'string') {
          // Remove [Context ...] blocks
          content = content.replace(/^\[[\s\S]*?\]\n*/, '');
          // Remove <system_context> ... </system_context> blocks if they appear at start (heuristic)
          content = content.replace(/^<[\w_]+>[\s\S]*?<\/[\w_]+>\n*/, '');
          // Remove "Context:" or "Current State:" prefixes if they exist
          content = content.replace(/^(Context|Current State|System Info):[\s\S]*?\n\n/, '');

          return content.trim();
        }
      }
    }
    return null;
  }, [sortedActivities, turn.userMessageContent]);

  const assistantResponse = React.useMemo(() => {
    // Helper to check if activity is internal detection/planning
    // (Not strictly needed for finding assistant response if we prioritize orchestrator, but good for consistency)

    // 1. Try to find the main orchestrator activity
    const mainActivity = sortedActivities.find(a =>
      (a.metadata?.operation === 'orchestrator-response') ||
      (a.metadata?.operation === 'converse-sonnet')
    );

    // 2. Fallback: Last activity (usually the response)
    const targetActivity = mainActivity || lastActivity;

    if (!targetActivity?.output) return null;
    const parsed = deepParse(targetActivity.output);

    // Handle structured output (common in our app)
    if (parsed.text) {
      if (typeof parsed.text === 'string') return parsed.text;
      if (typeof parsed.text === 'object' && parsed.text.response) return parsed.text.response;
    }

    // Handle direct properties
    if (typeof parsed.response === 'string') return parsed.response;
    if (typeof parsed.content === 'string') return parsed.content;

    return null;
  }, [sortedActivities, lastActivity]);

  return (
    <div className="turn-container">
      <div className="turn-header">
        <span className="turn-time">{new Date(turn.timestamp).toLocaleTimeString()}</span>
        <span className="turn-id">Turn {turn.id}</span>
      </div>

      {userMessage && (
        <div className="turn-summary user">
          <span className="summary-icon">👤</span>
          <div className="summary-bubble">{userMessage}</div>
        </div>
      )}

      <div className="turn-steps">
        {sortedActivities.map(activity => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>

      {assistantResponse && (
        <div className="turn-summary assistant">
          <div className="summary-bubble">{assistantResponse}</div>
          <span className="summary-icon">🤖</span>
        </div>
      )}
    </div>
  );
}

function ActivityItem({ activity }: { activity: BrainActivity }) {
  const [expanded, setExpanded] = useState(false);

  const getIcon = (type: ActivityType) => {
    switch (type) {
      case 'LLM_CALL': return '🤖';
      case 'EMBEDDING': return '🧠';
      case 'RETRIEVAL': return '🔍';
      case 'TOOL_USE': return '🛠️';
      default: return '📝';
    }
  };

  const isError = activity.status === 'FAILED';
  const isPending = activity.status === 'PENDING';
  const isEmbedding = activity.activityType === 'EMBEDDING';

  // Formatters
  const formatModelName = (model?: string) => {
    if (!model) return '';
    if (model.includes('haiku')) return 'Haiku';
    if (model.includes('sonnet')) return 'Sonnet';
    if (model.includes('opus')) return 'Opus';
    if (model.includes('titan')) return 'Titan';
    return model.split('/').pop() || model;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getIntent = () => {
    // 0. Special case for Embedding: show text in header
    if (isEmbedding) {
      const parsed = deepParse(activity.input);
      if (typeof parsed === 'string') return parsed;
      if (parsed?.text) return parsed.text;
    }

    // 1. Check metadata
    if (activity.metadata?.operation) return activity.metadata.operation;
    if (activity.metadata?.action) return activity.metadata.action;

    // 2. Check Input (if object)
    if (activity.input && typeof activity.input === 'object') {
      if (activity.input.operation) return activity.input.operation;
    }

    // 3. Fallback to basic type
    return activity.activityType;
  };

  const intent = getIntent();
  const modelDisplay = formatModelName(activity.model || undefined);
  const durationDisplay = activity.durationMs > 0 ? formatDuration(activity.durationMs) : '';

  return (
    <div className={`log-step type-${activity.activityType} ${isError ? 'error' : ''} ${isPending ? 'pending' : ''}`}>
      <div className="step-header" onClick={() => setExpanded(!expanded)}>
        <span className="step-uicon">{getIcon(activity.activityType)}</span>

        <div className="step-main-info">
          {isEmbedding ? (
            <span className="step-title" title={intent || ''}>
              Embedding: <span style={{ color: '#888', fontWeight: 'normal', marginLeft: '4px' }}>{intent}</span>
            </span>
          ) : (
            <span className="step-title" title={intent || ''}>{intent}</span>
          )}
          <div className="step-meta">
            {modelDisplay && <span className="meta-tag model">{modelDisplay}</span>}
            {durationDisplay && <span className="meta-tag duration">{durationDisplay}</span>}
          </div>
        </div>

        {activity.cost > 0 && (
          <div className="step-cost-preview">
            <FormattedPrice value={activity.cost} />
          </div>
        )}
        <div className={`step-status-icon ${activity.status.toLowerCase()}`} title={activity.status}>
          {activity.status === 'PENDING' && <span className="spinner">↻</span>}
          {activity.status === 'COMPLETED' && <span className="icon-success">✓</span>}
          {activity.status === 'FAILED' && <span className="icon-error">✕</span>}
        </div>
        <span className="step-toggle">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="step-body">
          <DetailBlock title="Metadata" data={activity.metadata} defaultOpen={false} />
          <DetailBlock title="Input" data={activity.input} defaultOpen={isEmbedding} />
          <DetailBlock title="Output" data={activity.output} defaultOpen={!isEmbedding} />
          <div className="stats-row" style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '0.85em', color: '#888' }}>
            <span>Tokens In: {activity.tokenCountInput}</span>
            <span>Tokens Out: {activity.tokenCountOutput}</span>
          </div>
        </div>
      )}
    </div>
  );
}


function deepParse(data: any): any {
  if (typeof data === 'string') {
    // Attempt robust parsing
    const parsed = parseJsonSafely(data);

    // If parsing succeeded
    if (parsed !== null) {
      // If result is an object/array, recurse to handle nested JSON in values
      if (typeof parsed === 'object') {
        return deepParse(parsed);
      }
      // If result is a string and different from input (e.g. double encoded), recurse
      if (typeof parsed === 'string' && parsed !== data) {
        return deepParse(parsed);
      }
      return parsed;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(deepParse);
  }

  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, deepParse(v)])
    );
  }

  return data;
}

function DetailBlock({ title, data, defaultOpen = false }: { title: string, data: any, defaultOpen?: boolean }) {
  if (!data) return null;

  // Memoize parsing
  const cleanData = React.useMemo(() => deepParse(data), [data]);

  // Check for empty (array or object)
  if (!cleanData) return null;
  if (Array.isArray(cleanData) && cleanData.length === 0) return null;
  if (typeof cleanData === 'object' && Object.keys(cleanData).length === 0) return null;

  const hasMessages = cleanData?.messages && Array.isArray(cleanData.messages) && cleanData.messages.length > 0;

  // Retrieval checks
  const hasRetrievalInput = cleanData?.searchQueries && Array.isArray(cleanData.searchQueries);
  const hasRetrievalOutput = Array.isArray(cleanData?.topMatches);

  // Memory check
  const hasMemoryOutput = (cleanData?.text && cleanData.text.hasMemoryIntent !== undefined) || (cleanData?.hasMemoryIntent !== undefined);

  // Retrieval Planning check
  const hasRetrievalPlanning = (cleanData?.text && cleanData.text.needsRetrieval !== undefined) || (cleanData?.needsRetrieval !== undefined);

  // Orchestrator Analysis check
  const hasOrchestratorAnalysis = (cleanData?.text && cleanData.text.analysis !== undefined) || (cleanData?.analysis !== undefined);

  // Reconciler checks
  const hasReconcilerShareSuggestion = !!(cleanData?.suggestedContent);
  const hasReconcilerThemes = !!(cleanData?.themes && Array.isArray(cleanData.themes));

  // Intelligent text extraction (only if no specific preview handles it)
  let textContent: string | null = null;

  if (!hasOrchestratorAnalysis) {
    if (typeof cleanData?.text === 'string') {
      textContent = cleanData.text;
    } else if (typeof cleanData?.text === 'object' && cleanData?.text !== null) {
      if (typeof cleanData.text.response === 'string') {
        textContent = cleanData.text.response;
      } else if (typeof cleanData.text.text === 'string') {
        textContent = cleanData.text.text;
      }
    } else if (typeof cleanData?.response === 'string') {
      textContent = cleanData.response;
    } else if (typeof cleanData?.content === 'string') {
      textContent = cleanData.content;
    }
  }


  const hasPreview = hasMessages || (textContent !== null && textContent.trim().length > 0) || hasRetrievalInput || hasRetrievalOutput || hasMemoryOutput || hasRetrievalPlanning || hasOrchestratorAnalysis || hasReconcilerShareSuggestion || hasReconcilerThemes;

  return (
    <details className="detail-section" open={defaultOpen}>
      <summary className="detail-header-summary">
        <h4>{title}</h4>
      </summary>

      <div className="detail-content-wrapper">
        {hasMessages && (
          <ChatPreview messages={cleanData.messages} />
        )}

        {hasRetrievalInput && (
          <RetrievalInputPreview data={cleanData} />
        )}

        {hasRetrievalOutput && (
          <RetrievalOutputPreview data={cleanData} />
        )}

        {hasRetrievalPlanning && (
          <RetrievalPlanningPreview data={cleanData} />
        )}

        {hasMemoryOutput && (
          <MemoryOutputPreview data={cleanData} />
        )}

        {hasOrchestratorAnalysis && (
          <OrchestratorAnalysisPreview data={cleanData} />
        )}

        {hasReconcilerShareSuggestion && (
          <ReconcilerShareSuggestionPreview data={cleanData} />
        )}

        {hasReconcilerThemes && (
          <ReconcilerThemesPreview data={cleanData} />
        )}

        {textContent && (
          <div className="text-preview">{textContent}</div>
        )}

        {/* Full JSON Fallback */}
        {hasPreview ? (
          <details>
            <summary className="json-summary">Raw JSON</summary>
            <JsonViewer data={cleanData} />
          </details>
        ) : (
          <JsonViewer data={cleanData} />
        )}
      </div>
    </details>
  );
}

function RetrievalInputPreview({ data }: { data: any }) {
  return (
    <div className="retrieval-preview">
      <div className="preview-label">Queries:</div>
      <ul className="query-list">
        {data.searchQueries.map((q: string, i: number) => <li key={i}>{q}</li>)}
      </ul>
      {data.referencesDetected && data.referencesDetected.length > 0 && (
        <>
          <div className="preview-label" style={{ marginTop: 10 }}>References:</div>
          <div className="refs-list">
            {data.referencesDetected.map((ref: any, i: number) => (
              <div key={i} className="ref-item">
                <span className="ref-text">"{ref.text}"</span>
                <span className="ref-meta">{ref.type} • {ref.confidence}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RetrievalOutputPreview({ data }: { data: any }) {
  const count = (data.crossSessionResultsCount || 0) + (data.withinSessionResultsCount || 0);
  const matches = data.topMatches || [];

  if (matches.length === 0) {
    if (count === 0) return <div className="text-preview">No matches found.</div>;
    return <div className="text-preview">Found {count} results (no top matches returned).</div>;
  }

  return (
    <div className="retrieval-preview">
      <div className="preview-stats">
        Found {count} results. Top {matches.length}:
      </div>
      {matches.map((match: any, i: number) => (
        <div key={i} className="match-item">
          <div className="match-score">{(match.score * 100).toFixed(0)}%</div>
          <div className="match-content">{match.content || match.text || JSON.stringify(match)}</div>
          <div className="match-meta">{match.source || 'Unknown source'}</div>
        </div>
      ))}
    </div>
  )
}

function RetrievalPlanningPreview({ data }: { data: any }) {
  const plan = data.text?.needsRetrieval !== undefined ? data.text : data;
  return (
    <div className="retrieval-preview">
      <div className="preview-label">Retrieval Planning</div>
      <div style={{ margin: '8px 0', color: plan.needsRetrieval ? '#4caf50' : '#888' }}>
        Needs Retrieval: <strong>{plan.needsRetrieval ? 'YES' : 'NO'}</strong>
      </div>

      {plan.searchQueries && plan.searchQueries.length > 0 && (
        <>
          <div className="preview-label">Planned Queries:</div>
          <ul className="query-list">
            {plan.searchQueries.map((q: string, i: number) => <li key={i}>{q}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}

function MemoryOutputPreview({ data }: { data: any }) {
  const mem = data.text?.hasMemoryIntent !== undefined ? data.text : data;

  return (
    <div className="retrieval-preview">
      <div className="preview-label">Memory Analysis</div>
      <div style={{ margin: '8px 0', color: mem.hasMemoryIntent ? '#4caf50' : '#888' }}>
        Detected Intent: <strong>{mem.hasMemoryIntent ? 'YES' : 'NO'}</strong>
      </div>

      {mem.topicContext && (
        <div style={{ marginBottom: 8, color: '#ccc', fontStyle: 'italic' }}>
          Context: "{mem.topicContext}"
        </div>
      )}

      {mem.suggestions && mem.suggestions.length > 0 ? (
        <div>
          <div className="preview-label">Suggestions:</div>
          <ul className="query-list">
            {mem.suggestions.map((s: any, i: number) => (
              <li key={i}>
                {typeof s === 'string' ? s : JSON.stringify(s)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ fontSize: '0.85em', color: '#666' }}>No suggestions generated.</div>
      )}
    </div>
  );
}

function OrchestratorAnalysisPreview({ data }: { data: any }) {
  // Extract fields from either root or .text property
  const root = data.text?.analysis !== undefined ? data.text : data;

  return (
    <div className="retrieval-preview">
      {/* Response Section */}
      {root.response && (
        <div className="assistant-response">
          <strong>Response</strong>
          <div style={{ whiteSpace: 'pre-wrap' }}>{root.response}</div>
        </div>
      )}

      {/* Analysis Section */}
      {root.analysis && (
        <div className="analysis-block">
          <h4>AI Analysis</h4>
          <div className="analysis-text" style={{ whiteSpace: 'pre-wrap' }}>
            {root.analysis}
          </div>
        </div>
      )}

      {/* Flags Section */}
      <div className="status-flags">
        {root.offerFeelHeardCheck !== undefined && (
          <span className={`status-tag ${root.offerFeelHeardCheck ? 'success' : 'neutral'}`}>
            Offer Feel Heard Check: {root.offerFeelHeardCheck ? 'YES' : 'NO'}
          </span>
        )}
        {root.modeDecision && (
          <span className="status-tag neutral">
            Mode: {root.modeDecision}
          </span>
        )}
      </div>

      {/* Show other miscellaneous keys if present */}
      {Object.keys(root).map(key => {
        if (['analysis', 'response', 'offerFeelHeardCheck', 'modeDecision'].includes(key)) return null;
        const val = root[key];
        if (typeof val === 'object' || Array.isArray(val)) return null; // Skip complex objects for simple list
        return (
          <div key={key} style={{ fontSize: '0.85em', color: '#666', marginTop: 4 }}>
            {key}: {String(val)}
          </div>
        );
      })}
    </div>
  );
}

function ChatPreview({ messages }: { messages: any[] }) {
  return (
    <div className="chat-preview">
      {messages.map((m: any, i: number) => (
        <div key={i} className={`chat-message role-${m.role}`}>
          <span className="msg-role">{m.role}:</span>
          <span className="msg-content">{typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}</span>
        </div>
      ))}
    </div>
  );
}

function JsonViewer({ data }: { data: any }) {
  if (typeof data !== 'object' || data === null) {
    return <div className="raw-text">{String(data)}</div>;
  }
  return (
    <pre className="json-block">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function FormattedPrice({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="price-component">$0.00</span>;

  // Format to 5 decimal places
  const str = value.toFixed(5);
  // Split into primary (upto 2 decimals) and secondary (rest) parts
  const [intPart, decPart] = str.split('.');
  const primaryDec = decPart ? decPart.substring(0, 2) : '00';
  const secondaryDec = decPart ? decPart.substring(2) : '';

  return (
    <span className="price-component" title={`$${str}`}>
      ${intPart}.{primaryDec}
      <span style={{ color: '#888' }}>{secondaryDec}</span>
    </span>
  );
}

function ReconcilerShareSuggestionPreview({ data }: { data: any }) {
  return (
    <div className="structured-card invitation">
      <h5>Share Suggestion</h5>
      <p style={{ fontStyle: 'normal', color: '#fff', marginBottom: '0.5rem' }}>"{data.suggestedContent}"</p>
      <div style={{ fontSize: '0.9em', color: '#c084fc', borderTop: '1px solid rgba(192, 132, 252, 0.2)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
        <strong style={{ textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Reason:</strong> {data.reason}
      </div>
    </div>
  );
}

function ReconcilerThemesPreview({ data }: { data: any }) {
  return (
    <div className="structured-card empathy">
      <h5>Extracted Themes</h5>
      <div className="status-flags" style={{ marginTop: 0 }}>
        {data.themes.map((theme: string, i: number) => (
          <span key={i} className="status-tag neutral" style={{ background: 'rgba(236, 72, 153, 0.1)', borderColor: 'rgba(236, 72, 153, 0.2)', color: '#fbcfe8' }}>
            {theme}
          </span>
        ))}
      </div>
    </div>
  );
}

export default SessionDetail;
