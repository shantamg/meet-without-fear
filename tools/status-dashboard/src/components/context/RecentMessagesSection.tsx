import React from 'react';
import { ContextMessage } from '../../types';

interface RecentMessagesSectionProps {
  recentTurns: ContextMessage[];
  turnCount: number;
  sessionDurationMinutes: number;
}

/**
 * RecentMessagesSection displays the sliding window of recent messages.
 * Messages are shown as a list with role labels.
 */
export function RecentMessagesSection({
  recentTurns,
  turnCount,
  sessionDurationMinutes,
}: RecentMessagesSectionProps) {
  return (
    <div className="context-section recent-messages">
      <div className="section-header">
        <h4>Recent Messages (Sliding Window)</h4>
        <span className="turn-count">{turnCount} turns</span>
        {sessionDurationMinutes > 0 && (
          <span className="duration">{sessionDurationMinutes} min</span>
        )}
      </div>

      <div className="section-content">
        {recentTurns.length === 0 ? (
          <div className="empty-section">No messages yet</div>
        ) : (
          <ul className="message-list">
            {recentTurns.map((msg, idx) => (
              <li key={idx} className={`message-item ${msg.role}`}>
                <span className="message-role">
                  {msg.role === 'user' ? 'USER' : 'ASSISTANT'}:
                </span>
                <span className="message-content">{msg.content}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
