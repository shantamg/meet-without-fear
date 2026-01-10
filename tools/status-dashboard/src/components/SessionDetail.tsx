
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Ably from 'ably';
import { AuditLogEntry } from '../types';
import { parseJsonSafely } from '../utils/json';

const ablyKey = import.meta.env.VITE_ABLY_KEY;

interface Turn {
  id: string;
  logs: AuditLogEntry[];
  timestamp: string;
  userMessage?: string;
  userId?: string;
}

interface UserInfo {
  id: string;
  name: string;
  isInitiator: boolean;
}

function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [sessionData, setSessionData] = useState<any>(null);
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

  // Group logs into turns and associate with users
  const turns = React.useMemo(() => {
    const groups: Turn[] = [];
    const turnMap = new Map<string, Turn>();

    logs.forEach(log => {
      let turnId = log.turnId;
      if (!turnId && log.data?.sessionId && log.data?.turnCount) {
        turnId = `${log.data.sessionId}-${log.data.turnCount}`;
      }
      if (!turnId) {
        turnId = `orphan-${Math.floor(new Date(log.timestamp).getTime() / 10000)}`;
      }

      if (!turnMap.has(turnId)) {
        const newTurn: Turn = { id: turnId, logs: [], timestamp: log.timestamp };
        turnMap.set(turnId, newTurn);
        groups.push(newTurn);
      }

      const turn = turnMap.get(turnId)!;
      turn.logs.push(log);

      // Extract user message and userId if present
      if (log.section === 'USER') {
        if (log.data?.userMessage) {
          turn.userMessage = log.data.userMessage;
        }
        if (log.data?.userId) {
          turn.userId = log.data.userId;
        }
      }
    });

    return groups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs]);

  // Split turns by user
  const { initiatorTurns, inviteeTurns, unassignedTurns } = React.useMemo(() => {
    const initiatorTurns: Turn[] = [];
    const inviteeTurns: Turn[] = [];
    const unassignedTurns: Turn[] = [];

    turns.forEach(turn => {
      if (turn.userId === users.initiator?.id) {
        initiatorTurns.push(turn);
      } else if (turn.userId === users.invitee?.id) {
        inviteeTurns.push(turn);
      } else {
        // For turns without userId, try to infer from userName in logs
        const userLog = turn.logs.find(l => l.section === 'USER');
        const userName = userLog?.data?.userName;
        
        if (userName && users.initiator?.name && userName === users.initiator.name) {
          initiatorTurns.push(turn);
        } else if (userName && users.invitee?.name && userName === users.invitee.name) {
          inviteeTurns.push(turn);
        } else {
          unassignedTurns.push(turn);
        }
      }
    });

    return { initiatorTurns, inviteeTurns, unassignedTurns };
  }, [turns, users]);

  // Auto-scroll to top when new turns arrive
  const prevTurnCountRef = useRef({ initiator: 0, invitee: 0 });
  
  useEffect(() => {
    if (initiatorTurns.length > prevTurnCountRef.current.initiator) {
      leftColumnRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (inviteeTurns.length > prevTurnCountRef.current.invitee) {
      rightColumnRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    prevTurnCountRef.current = {
      initiator: initiatorTurns.length,
      invitee: inviteeTurns.length,
    };
  }, [initiatorTurns.length, inviteeTurns.length]);

  useEffect(() => {
    fetchLogs();

    if (!ablyKey) {
      console.error('VITE_ABLY_KEY missing');
      setAblyStatus('error');
      return;
    }

    const client = new Ably.Realtime(ablyKey);
    const channel = client.channels.get('ai-audit-stream');

    client.connection.on('connected', () => setAblyStatus('connected'));
    client.connection.on('disconnected', () => setAblyStatus('disconnected'));

    channel.subscribe('log', (msg) => {
      const data = msg.data as AuditLogEntry;
      const logSessionId = data.sessionId || data.data?.sessionId;

      if (logSessionId === sessionId) {
        setLogs(prev => [...prev, data]);
        if (data.cost) {
          setTotalCost(c => c + data.cost!);
        }
      }
    });

    return () => {
      channel.unsubscribe();
      client.close();
    };
  }, [sessionId]);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/audit/sessions/${sessionId}/logs`);
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${res.statusText}`);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setLogs(json.data.logs || []);
        setTotalCost(json.data.summary?.totalCost || 0);
        setSessionData(json.data.session);
        setError(null);
      } else {
        setError('API returned success: false');
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
      setError(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading logs...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  // Check if we have two users
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
          Total Cost: <FormattedPrice value={totalCost} />
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
              {initiatorTurns.length === 0 && (
                <div className="empty-column">No messages yet</div>
              )}
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
              {inviteeTurns.length === 0 && (
                <div className="empty-column">No messages yet</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Fallback to single column view if only one user
        <div className="turns-feed">
          {turns.map(turn => (
            <TurnView key={turn.id} turn={turn} userName={users.initiator?.name || 'User'} />
          ))}
          {turns.length === 0 && logs.length > 0 && (
            <div className="empty-state">
              <p>{logs.length} log(s) found but no displayable turns.</p>
              <p>Sections: {[...new Set(logs.map(l => l.section))].join(', ')}</p>
            </div>
          )}
          {turns.length === 0 && logs.length === 0 && (
            <div className="empty-state">No activity recorded for this session.</div>
          )}
        </div>
      )}

      {/* Show unassigned turns at bottom if any */}
      {unassignedTurns.length > 0 && hasTwoUsers && (
        <div className="unassigned-turns">
          <h3>System Events</h3>
          {unassignedTurns.map(turn => (
            <TurnView key={turn.id} turn={turn} userName="System" />
          ))}
        </div>
      )}
    </div>
  );
}

function TurnView({ turn, userName }: { turn: Turn, userName: string }) {
  const userLog = turn.logs.find(l => l.section === 'USER');
  let otherLogs = turn.logs.filter(l => l !== userLog);

  // Separate out LLM_START and COST logs to pair them
  const derivedLogs: AuditLogEntry[] = [];
  const costLogs: AuditLogEntry[] = [];
  const llmStartLogs: AuditLogEntry[] = [];

  otherLogs.forEach(log => {
    if (log.section === 'COST') {
      costLogs.push(log);
    } else if (log.section === 'LLM_START') {
      llmStartLogs.push(log);
    } else {
      derivedLogs.push({ ...log, data: { ...log.data } });
    }
  });

  // Match LLM_START with COST by operation
  const completedOps = new Set(costLogs.map(c => c.data?.operation));
  const pendingLlmCalls = llmStartLogs.filter(start => !completedOps.has(start.data?.operation));

  // Merge LLM_START info into COST log
  costLogs.forEach(costLog => {
    const matchingStart = llmStartLogs.find(start => start.data?.operation === costLog.data?.operation);
    if (matchingStart && !costLog.data?.startTimestamp) {
      costLog.data = {
        ...costLog.data,
        startTimestamp: matchingStart.timestamp,
      };
    }
  });

  // Attach costs to their relevant operation
  costLogs.forEach(costLog => {
    const op = costLog.data?.operation;
    let targetLog: AuditLogEntry | undefined;

    if (op === 'orchestrator-response' || op === 'sonnet-response') {
      targetLog = derivedLogs.find(l => l.section === 'RESPONSE');
    } else if (op === 'retrieval-planning' || op === 'haiku-json' || op === 'embedding') {
      targetLog = derivedLogs.find(l => l.section === 'RETRIEVAL');
      if (!targetLog) targetLog = derivedLogs.find(l => l.section === 'INTENT');
    } else if (op === 'memory-detection') {
      targetLog = derivedLogs.find(l => l.section === 'MEMORY_DETECTION');
    }

    if (targetLog) {
      if (!targetLog.data) targetLog.data = {};
      const existing = targetLog.data.costInfo || { totalCost: 0, inputTokens: 0, outputTokens: 0, model: '' };

      targetLog.data.costInfo = {
        model: existing.model ? `${existing.model} + ${costLog.data.model}` : costLog.data.model,
        inputTokens: (existing.inputTokens || 0) + (costLog.data.inputTokens || 0),
        outputTokens: (existing.outputTokens || 0) + (costLog.data.outputTokens || 0),
        totalCost: (existing.totalCost || 0) + (costLog.data.totalCost || 0),
      };
    } else {
      if (derivedLogs.length > 0) {
        const lastLog = derivedLogs[derivedLogs.length - 1];
        if (!lastLog.data) lastLog.data = {};
        lastLog.data.costInfo = {
          model: costLog.data?.model || 'unknown',
          inputTokens: costLog.data?.inputTokens,
          outputTokens: costLog.data?.outputTokens,
          totalCost: costLog.data?.totalCost
        };
      }
    }
  });

  // Merge redundant RESPONSE logs
  const responseLogs = derivedLogs.filter(l => l.section === 'RESPONSE');
  if (responseLogs.length > 1) {
    const mainResponse = responseLogs.find(l => {
      const text = l.data?.responseText || l.data?.responsePreview || '';
      return text.includes('<analysis>') || text.includes('"invitationMessage"');
    }) || responseLogs.find(l => l.data?.responseText) || responseLogs[0];
    const otherResponses = responseLogs.filter(l => l !== mainResponse);

    otherResponses.forEach(other => {
      if (other.data?.durationMs) mainResponse.data.durationMs = other.data.durationMs;
      if (other.data?.totalDuration) mainResponse.data.totalDuration = other.data.totalDuration;

      if (other.data?.costInfo) {
        const existing = mainResponse.data.costInfo || { totalCost: 0, inputTokens: 0, outputTokens: 0, model: '' };
        const otherCost = other.data.costInfo;

        mainResponse.data.costInfo = {
          model: existing.model || otherCost.model,
          inputTokens: (existing.inputTokens || 0) + (otherCost.inputTokens || 0),
          outputTokens: (existing.outputTokens || 0) + (otherCost.outputTokens || 0),
          totalCost: (existing.totalCost || 0) + (otherCost.totalCost || 0),
        };
      }

      const idx = derivedLogs.indexOf(other);
      if (idx > -1) derivedLogs.splice(idx, 1);
    });
  }

  // Show standalone cost logs if nothing to attach them to
  if (derivedLogs.length === 0 && costLogs.length > 0) {
    costLogs.forEach(costLog => {
      derivedLogs.push({ ...costLog, data: { ...costLog.data } });
    });
  }

  // Add pending LLM calls
  pendingLlmCalls.forEach(startLog => {
    derivedLogs.push({
      ...startLog,
      section: 'LLM_START',
      data: { ...startLog.data, pending: true },
    });
  });

  // Sort by timestamp
  derivedLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Determine Turn Title
  const intentLog = turn.logs.find(l => l.section === 'INTENT');
  const userMessage = turn.userMessage ||
    userLog?.message ||
    intentLog?.data?.userInput ||
    (derivedLogs.length > 0 ? <span className="placeholder">System Event</span> : null);

  if (!userMessage && derivedLogs.length === 0) return null;

  return (
    <div className="turn-container">
      <div className="turn-header">
        <span className="turn-time">{new Date(turn.timestamp).toLocaleTimeString()}</span>
        <span className="turn-id">Turn {turn.id}</span>
      </div>

      <div className="turn-user-message">
        <div className="icon">{userLog ? '💬' : '⚙️'}</div>
        <div className="message-content">
          {userMessage}
        </div>
      </div>

      <div className="turn-steps">
        {derivedLogs.map((log, i) => (
          <LogStep key={i} log={log} />
        ))}
      </div>
    </div>
  );
}

function LogStep({ log }: { log: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const renderContent = () => {
    switch (log.section) {
      case 'INTENT':
        return <IntentDetail data={log.data} />;
      case 'RETRIEVAL':
        return <RetrievalDetail data={log.data} />;
      case 'RESPONSE':
        return <ResponseDetail log={log} />;
      case 'PROMPT':
        return <PromptDetail data={log.data} />;
      case 'COST':
        return <CostDetail data={log.data} cost={log.cost} />;
      case 'LLM_START':
        return <LlmStartDetail data={log.data} />;
      case 'MEMORY_DETECTION':
        return <MemoryDetail data={log.data} />;
      default:
        return <GenericDetail data={log.data || { message: log.message }} />;
    }
  };

  return (
    <div className={`log-step type-${log.section}`}>
      <div className="step-header" onClick={() => setExpanded(!expanded)}>
        <span className="step-uicon">{getIcon(log.section)}</span>
        <span className="step-title">{log.section}</span>
        <span className="step-preview">{getPreview(log)}</span>
        {log.data?.costInfo && (
          <div className="step-cost-preview">
            <FormattedPrice value={log.data.costInfo.totalCost} />
          </div>
        )}
        <span className="step-toggle">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="step-body">
          {renderContent()}
        </div>
      )}
    </div>
  );
}

// --- Helper Components ---

function formatModelName(model?: string) {
  if (!model) return '';
  const lower = model.toLowerCase();
  if (lower.includes('sonnet')) return 'SONNET';
  if (lower.includes('haiku')) return 'HAIKU';
  if (lower.includes('titan')) return 'TITAN';
  return model.split('/').pop()?.split(':')[0] || model;
}

function FormattedPrice({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="price-component">$0.00</span>;

  const str = value.toFixed(5);
  const match = str.match(/^(\d+\.\d{2})(\d*)$/);

  if (!match) return <span className="price-component">${str}</span>;

  const [_, main, fraction] = match;

  return (
    <span className="price-component">
      <span className="price-main">${main}</span>
      <span className="price-fraction">{fraction}</span>
    </span>
  );
}

function DetailWrapper({ children, data, title }: { children: React.ReactNode, data: any, title?: string }) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="detail-wrapper">
      <div className="detail-header-row">
        {title && <h3 className="detail-title">{title}</h3>}
        {data?.costInfo && (
          <div className="inline-cost-badge">
            <span className="model-name">{formatModelName(data.costInfo.model)}</span>
            <FormattedPrice value={data.costInfo.totalCost} />
          </div>
        )}
      </div>

      <div className="formatted-view">
        {children}
      </div>

      <div className="json-toggle-container">
        <button
          className="json-toggle-btn"
          onClick={() => setShowJson(!showJson)}
        >
          {showJson ? 'Hide Raw JSON' : 'Show Raw JSON'}
        </button>

        {showJson && (
          <div className="raw-json-container">
            <JsonViewer data={data} />
          </div>
        )}
      </div>
    </div>
  );
}

function IntentDetail({ data }: { data: any }) {
  if (!data) return null;

  return (
    <DetailWrapper data={data}>
      <div className="key-value-grid">
        <div className="kv-item">
          <span className="kv-label">Intent</span>
          <span className="kv-value highlight">{data.intent}</span>
        </div>
        <div className="kv-item">
          <span className="kv-label">Depth</span>
          <span className="kv-value">{data.depth}</span>
        </div>
        <div className="kv-item">
          <span className="kv-label">Intensity</span>
          <span className="kv-value">{data.emotionalIntensity}/10</span>
        </div>
        <div className="kv-item full-width">
          <span className="kv-label">Reasoning</span>
          <span className="kv-value text-block">{data.reason}</span>
        </div>
        {data.userInput && (
          <div className="kv-item full-width">
            <span className="kv-label">Analyzed Input</span>
            <span className="kv-value text-block dim">{data.userInput}</span>
          </div>
        )}
      </div>
    </DetailWrapper>
  );
}

function RetrievalDetail({ data }: { data: any }) {
  if (!data) return null;

  return (
    <DetailWrapper data={data}>
      {data.searchQueries && (
        <div className="retrieval-section">
          <strong>Queries:</strong>
          <ul className="query-list">
            {data.searchQueries.map((q: string, i: number) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      {!data.searchQueries && !data.topMatches && !data.summary && (data.turnCount !== undefined || data.stage !== undefined) && (
        <div className="key-value-grid">
          {data.stage !== undefined && (
            <div className="kv-item">
              <span className="kv-label">Stage</span>
              <span className="kv-value">{data.stage}</span>
            </div>
          )}
          {data.turnCount !== undefined && (
            <div className="kv-item">
              <span className="kv-label">Turn Count</span>
              <span className="kv-value">{data.turnCount}</span>
            </div>
          )}
          <div className="kv-item full-width">
            <span className="kv-label">Status</span>
            <span className="kv-value">Context Bundle Assembled</span>
          </div>
        </div>
      )}

      {(data.topMatches || []).length > 0 && (
        <div className="retrieval-section">
          <strong>Matches:</strong>
          <div className="memory-list">
            {data.topMatches.map((m: any, i: number) => (
              <div key={i} className="memory-item">
                <span className="memory-source">{m.source}</span>
                <p>{m.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.summary && (
        <div className="retrieval-section">
          <strong>Summary:</strong>
          <p>{data.summary}</p>
        </div>
      )}
    </DetailWrapper>
  );
}


function MemoryDetail({ data }: { data: any }) {
  if (!data) return null;

  const valid = data.validation === 'valid' || data.validation === true;

  return (
    <DetailWrapper data={data}>
      <div className="key-value-grid">
        <div className="kv-item full-width">
          <span className="kv-label">Suggestion</span>
          <span className="kv-value text-block highlight">"{data.content}"</span>
        </div>

        <div className="kv-item">
          <span className="kv-label">Category</span>
          <span className="kv-value">{data.category}</span>
        </div>

        <div className="kv-item">
          <span className="kv-label">Scope</span>
          <span className={`kv-value tag ${data.scope === 'global' ? 'scope-global' : 'scope-session'}`}>
            {data.scope?.toUpperCase()}
          </span>
        </div>

        <div className="kv-item">
          <span className="kv-label">Confidence</span>
          <span className="kv-value">{data.confidence}</span>
        </div>

        <div className="kv-item full-width">
          <span className="kv-label">Evidence</span>
          <span className="kv-value text-block dim">{data.evidence}</span>
        </div>

        {data.rejectionReason && (
          <div className="kv-item full-width validation-error">
            <span className="kv-label">Rejection Reason</span>
            <span className="kv-value error-text">{data.rejectionReason}</span>
          </div>
        )}

        <div className="kv-item full-width">
          <span className="kv-label">Status</span>
          <span className={`kv-value status-badge ${valid ? 'valid' : 'invalid'}`}>
            {valid ? '✓ Validated' : '✕ Rejected'}
          </span>
        </div>
      </div>
    </DetailWrapper>
  );
}

function ResponseDetail({ log }: { log: AuditLogEntry }) {
  const data = log.data || {};
  let responseText = data.responseText || data.responsePreview || log.message;

  const analysisMatch = responseText.match(/<analysis>([\s\S]*?)<\/analysis>/);
  let analysis = data.analysis || null;
  let jsonContent = null;

  if (analysisMatch && !analysis) {
    analysis = analysisMatch[1].trim();
    responseText = responseText.replace(analysisMatch[0], '').trim();
  }

  const parsed = parseJsonSafely(responseText);
  if (parsed) {
    jsonContent = parsed;
    if (!analysis && typeof jsonContent.analysis === 'string') {
      analysis = jsonContent.analysis;
    }
  } else {
    if (data.invitationMessage || data.proposedEmpathyStatement || data.offerReadyToShare !== undefined) {
      jsonContent = {
        response: null,
        invitationMessage: data.invitationMessage,
        proposedEmpathyStatement: data.proposedEmpathyStatement,
        offerReadyToShare: data.offerReadyToShare,
        offerFeelHeardCheck: data.offerFeelHeardCheck
      };
    }
  }

  return (
    <DetailWrapper data={data}>
      {analysis && (
        <div className="analysis-block">
          <h4>Analysis</h4>
          <div className="analysis-text">
            {analysis.split('\n').map((line: string, i: number) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {jsonContent ? (
        <div className="response-full">
          {jsonContent.response && (
            <div className="assistant-response">
              {jsonContent.response.split('\n').map((line: string, i: number) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          <div className="structured-fields">
            {jsonContent.invitationMessage && (
              <div className="structured-card invitation">
                <h5>Proposed Invitation</h5>
                <p>"{jsonContent.invitationMessage}"</p>
              </div>
            )}

            {jsonContent.proposedEmpathyStatement && (
              <div className="structured-card empathy">
                <h5>Empathy Statement</h5>
                <p>"{jsonContent.proposedEmpathyStatement}"</p>
              </div>
            )}
          </div>

          <div className="status-flags">
            {jsonContent.offerReadyToShare !== undefined && (
              <span className={`status-tag ${jsonContent.offerReadyToShare ? 'success' : 'neutral'}`}>
                {jsonContent.offerReadyToShare ? '✓ Ready to Share' : '○ Not Ready'}
              </span>
            )}
            {jsonContent.offerFeelHeardCheck !== undefined && (
              <span className={`status-tag ${jsonContent.offerFeelHeardCheck ? 'success' : 'neutral'}`}>
                {jsonContent.offerFeelHeardCheck ? '✓ Check: Feel Heard' : '○ No Check'}
              </span>
            )}
          </div>

          <div className="raw-json-fallback"></div>
        </div>
      ) : (
        <div className="response-full">
          {responseText.split('\n').map((line: string, i: number) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </DetailWrapper>
  );
}

function PromptDetail({ data }: { data: any }) {
  if (!data) return null;

  return (
    <DetailWrapper data={data}>
      {data.fullPrompt && (
        <div className="full-prompt">
          <h3>System Prompt</h3>
          <div className="prompt-text">
            {data.fullPrompt}
          </div>
        </div>
      )}

      {data.fullContextBundle && (
        <div className="context-preview">
          <h4>Context Bundle</h4>
          <pre>{data.fullContextBundle}</pre>
        </div>
      )}

      {data.fullRetrievedContext && (
        <div className="context-preview">
          <h4>Retrieved Context</h4>
          <pre>{data.fullRetrievedContext}</pre>
        </div>
      )}
    </DetailWrapper>
  );
}

function LlmStartDetail({ data }: { data: any }) {
  const getOperationLabel = (op?: string) => {
    if (!op) return 'AI Operation';
    const labels: Record<string, string> = {
      'stage1-initial-message': 'Welcome Message',
      'stage1-transition': 'Stage 1→2 Transition',
      'stage2-transition': 'Stage 2→3 Transition',
      'chat-router-response': 'Chat Response',
      'chat-router-welcome': 'Welcome Message',
      'intent-detection': 'Intent Detection',
      'orchestrator-response': 'AI Response',
      'sonnet-response': 'AI Response',
      'retrieval-planning': 'Memory Planning',
      'memory-detection': 'Memory Detection',
      'memory-validation': 'Memory Validation',
      'haiku-json': 'Quick Analysis',
    };
    return labels[op] || op.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <DetailWrapper data={data}>
      <div className="llm-start-detail">
        <div className="in-progress-indicator">
          <span className="spinner">⏳</span>
          <span className="status-text">In Progress...</span>
        </div>
        <div className="key-value-grid">
          {data?.operation && (
            <div className="kv-item">
              <span className="kv-label">Operation</span>
              <span className="kv-value highlight">{getOperationLabel(data.operation)}</span>
            </div>
          )}
          {data?.model && (
            <div className="kv-item">
              <span className="kv-label">Model</span>
              <span className="kv-value">{formatModelName(data.model)}</span>
            </div>
          )}
        </div>
      </div>
    </DetailWrapper>
  );
}

function CostDetail({ data, cost }: { data: any, cost?: number }) {
  const getOperationLabel = (op?: string) => {
    if (!op) return 'AI Operation';
    const labels: Record<string, string> = {
      'stage1-initial-message': 'Welcome Message',
      'stage1-transition': 'Stage 1→2 Transition',
      'stage2-transition': 'Stage 2→3 Transition',
      'chat-router-response': 'Chat Response',
      'chat-router-welcome': 'Welcome Message',
      'intent-detection': 'Intent Detection',
      'people-extraction': 'People Extraction',
      'orchestrator-response': 'AI Response',
      'sonnet-response': 'AI Response',
      'retrieval-planning': 'Memory Planning',
      'memory-detection': 'Memory Detection',
      'memory-validation': 'Memory Validation',
      'inner-work-initial': 'Inner Work Welcome',
      'inner-work-response': 'Inner Work Response',
      'inner-work-metadata': 'Inner Work Setup',
      'inner-thoughts-summary': 'Thoughts Summary',
      'meditation-script': 'Meditation Script',
      'gratitude-response': 'Gratitude Response',
      'pre-session-witnessing': 'Pre-Session Witnessing',
      'conversation-summary': 'Conversation Summary',
      'extract-needs': 'Needs Extraction',
      'common-ground': 'Common Ground Analysis',
      'haiku-json': 'Quick Analysis',
      'embedding': 'Text Embedding',
    };
    return labels[op] || op.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <DetailWrapper data={data}>
      <div className="cost-detail">
        {data?.operation && (
          <div className="cost-metric full-width">
            <span className="label">Operation</span>
            <span className="value highlight">{getOperationLabel(data.operation)}</span>
          </div>
        )}
        {data?.model && (
          <div className="cost-metric">
            <span className="label">Model</span>
            <span className="value">{formatModelName(data.model)}</span>
          </div>
        )}
        <div className="cost-metric">
          <span className="label">Input Tokens</span>
          <span className="value">{data?.inputTokens || 0}</span>
        </div>
        <div className="cost-metric">
          <span className="label">Output Tokens</span>
          <span className="value">{data?.outputTokens || 0}</span>
        </div>
        <div className="cost-metric">
          <span className="label">Total Cost</span>
          <span className="value cost-highlight">${cost?.toFixed(5) || data?.totalCost?.toFixed(5) || '0.00000'}</span>
        </div>
        {data?.durationMs && (
          <div className="cost-metric">
            <span className="label">Duration</span>
            <span className="value">{formatDuration(data.durationMs)}</span>
          </div>
        )}
      </div>
    </DetailWrapper>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function GenericDetail({ data }: { data: any }) {
  return (
    <DetailWrapper data={data}>
      <div className="generic-preview">
        {data.message && <p>{data.message}</p>}
      </div>
    </DetailWrapper>
  );
}

function JsonViewer({ data }: { data: any }) {
  return (
    <pre className="json-view">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function getIcon(section: string) {
  switch (section) {
    case 'INTENT': return '🧠';
    case 'RETRIEVAL': return '🔍';
    case 'RESPONSE': return '🤖';
    case 'COST': return '💰';
    case 'LLM_START': return '⏳';
    case 'MEMORY_DETECTION': return '📝';
    default: return '📝';
  }
}

function getPreview(log: AuditLogEntry) {
  if (log.section === 'INTENT') return log.data?.reason || log.message;
  if (log.section === 'LLM_START') {
    const op = log.data?.operation;
    const opLabels: Record<string, string> = {
      'stage1-initial-message': 'Welcome',
      'stage1-transition': 'Stage 1→2',
      'stage2-transition': 'Stage 2→3',
      'chat-router-response': 'Chat',
      'orchestrator-response': 'Response',
      'sonnet-response': 'Response',
      'retrieval-planning': 'Memory Plan',
      'memory-detection': 'Memory',
      'haiku-json': 'Analysis',
    };
    const label = op ? (opLabels[op] || op) : 'AI Call';
    const model = formatModelName(log.data?.model);
    return `${model ? model + ' · ' : ''}${label} · Running...`;
  }
  if (log.section === 'COST') {
    const op = log.data?.operation;
    const opLabels: Record<string, string> = {
      'stage1-initial-message': 'Welcome',
      'stage1-transition': 'Stage 1→2',
      'stage2-transition': 'Stage 2→3',
      'chat-router-response': 'Chat',
      'chat-router-welcome': 'Welcome',
      'intent-detection': 'Intent',
      'orchestrator-response': 'Response',
      'sonnet-response': 'Response',
      'retrieval-planning': 'Memory Plan',
      'memory-detection': 'Memory',
      'memory-validation': 'Validation',
      'inner-work-initial': 'Inner Work',
      'inner-work-response': 'Inner Work',
      'meditation-script': 'Meditation',
      'gratitude-response': 'Gratitude',
      'haiku-json': 'Analysis',
      'embedding': 'Embed',
    };
    const label = op ? (opLabels[op] || op) : 'AI Call';
    const duration = log.data?.durationMs ? ` · ${formatDuration(log.data.durationMs)}` : '';
    return `${label} · $${log.cost?.toFixed(4) || log.data?.totalCost?.toFixed(4) || '0.00'}${duration}`;
  }
  return log.message.substring(0, 50) + (log.message.length > 50 ? '...' : '');
}

export default SessionDetail;
