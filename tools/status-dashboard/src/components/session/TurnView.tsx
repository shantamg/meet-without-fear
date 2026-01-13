import React, { useMemo } from 'react';
import { Turn } from '../../utils/turnGrouping';
import { BrainActivity } from '../../types';
import { deepParse } from '../../utils/dataParsing';
import { formatTime } from '../../utils/formatters';
import { ActivityItem } from './ActivityItem';

interface TurnViewProps {
  turn: Turn;
  userName: string;
}

export function TurnView({ turn, userName }: TurnViewProps) {
  // Sort activities by time
  const sortedActivities = useMemo(() => 
    [...turn.activities].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
    [turn.activities]
  );

  const lastActivity = sortedActivities[sortedActivities.length - 1];

  // Extract user message
  const userMessage = useMemo(() => {
    // Use canonical message from DB if matched
    if (turn.userMessageContent) return turn.userMessageContent;

    // Helper to check if activity is internal detection/planning
    const isInternal = (act: BrainActivity) => {
      const parsedInput = act.input ? deepParse(act.input) : null;
      const op = act.metadata?.operation || (parsedInput as any)?.operation;
      return op === 'memory-detection' || op === 'retrieval-planning' || op === 'intent-detection';
    };

    // Try to find the main orchestrator activity
    const mainActivity = sortedActivities.find(a =>
      (a.metadata?.operation === 'orchestrator-response') ||
      (a.metadata?.operation === 'converse-sonnet')
    );

    // Fallback: Find first non-internal activity
    const targetActivity = mainActivity || sortedActivities.find(a => !isInternal(a)) || sortedActivities[0];

    if (!targetActivity?.input) return null;

    const parsed = deepParse(targetActivity.input);
    if (parsed.messages && Array.isArray(parsed.messages)) {
      const userMsgs = parsed.messages.filter((m: any) => m.role === 'user');
      if (userMsgs.length > 0) {
        let content = userMsgs[userMsgs.length - 1].content;
        if (typeof content === 'string') {
          // Clean up context injection
          content = content.replace(/^\[[\s\S]*?\]\n*/, '');
          content = content.replace(/^<[\w_]+>[\s\S]*?<\/[\w_]+>\n*/, '');
          content = content.replace(/^(Context|Current State|System Info):[\s\S]*?\n\n/, '');
          return content.trim();
        }
      }
    }
    return null;
  }, [sortedActivities, turn.userMessageContent]);

  // Extract assistant response
  const assistantResponse = useMemo(() => {
    const mainActivity = sortedActivities.find(a =>
      (a.metadata?.operation === 'orchestrator-response') ||
      (a.metadata?.operation === 'converse-sonnet')
    );

    const targetActivity = mainActivity || lastActivity;

    if (!targetActivity?.output) return null;
    const parsed = deepParse(targetActivity.output);

    // Handle structured output
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
        <span className="turn-time">{formatTime(turn.timestamp)}</span>
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
