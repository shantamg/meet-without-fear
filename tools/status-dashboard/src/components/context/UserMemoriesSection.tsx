import React from 'react';
import { UserMemoriesContext } from '../../types';

interface UserMemoriesSectionProps {
  userMemories?: UserMemoriesContext;
}

/**
 * UserMemoriesSection displays global and session memories.
 * Shows memories with category badges and visual distinction between global and session.
 */
export function UserMemoriesSection({ userMemories }: UserMemoriesSectionProps) {
  const hasGlobal = userMemories?.global && userMemories.global.length > 0;
  const hasSession = userMemories?.session && userMemories.session.length > 0;
  const hasAnyMemories = hasGlobal || hasSession;

  return (
    <div className="context-section user-memories">
      <div className="section-header">
        <h4>User Memories</h4>
        {hasAnyMemories && (
          <span className="memory-count">
            {(userMemories?.global?.length || 0) + (userMemories?.session?.length || 0)} memories
          </span>
        )}
      </div>

      <div className="section-content">
        {!hasAnyMemories ? (
          <div className="empty-section">No memories</div>
        ) : (
          <div className="memories-container">
            {hasGlobal && (
              <div className="memory-group global-memories">
                <span className="group-label">Global Memories</span>
                <ul className="memory-list">
                  {userMemories!.global.map((memory, idx) => (
                    <li key={idx} className="memory-item">
                      <span className="category-badge gray">{memory.category}</span>
                      <span className="memory-content">{memory.content}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasSession && (
              <div className="memory-group session-memories">
                <span className="group-label">Session Memories</span>
                <ul className="memory-list">
                  {userMemories!.session.map((memory, idx) => (
                    <li key={idx} className="memory-item">
                      <span className="category-badge blue">{memory.category}</span>
                      <span className="memory-content">{memory.content}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
