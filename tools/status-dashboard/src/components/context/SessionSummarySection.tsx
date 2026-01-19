import React from 'react';
import { SessionSummaryContext } from '../../types';

interface SessionSummarySectionProps {
  sessionSummary?: SessionSummaryContext;
}

/**
 * SessionSummarySection displays session summary in compact cards.
 * Shows key themes, emotional journey, current focus, and unresolved topics.
 */
export function SessionSummarySection({ sessionSummary }: SessionSummarySectionProps) {
  if (!sessionSummary) {
    return (
      <div className="context-section session-summary">
        <div className="section-header">
          <h4>Session Summary</h4>
        </div>
        <div className="section-content">
          <div className="empty-section">No summary generated yet</div>
        </div>
      </div>
    );
  }

  const { keyThemes, emotionalJourney, currentFocus, userStatedGoals } = sessionSummary;

  return (
    <div className="context-section session-summary">
      <div className="section-header">
        <h4>Session Summary</h4>
      </div>

      <div className="section-content">
        <div className="summary-cards">
          {keyThemes.length > 0 && (
            <div className="summary-card themes">
              <span className="card-label">Key Themes</span>
              <div className="theme-chips">
                {keyThemes.map((theme, idx) => (
                  <span key={idx} className="theme-chip">{theme}</span>
                ))}
              </div>
            </div>
          )}

          {emotionalJourney && (
            <div className="summary-card emotional-journey">
              <span className="card-label">Emotional Journey</span>
              <p className="card-text">{emotionalJourney}</p>
            </div>
          )}

          {currentFocus && (
            <div className="summary-card current-focus">
              <span className="card-label">Current Focus</span>
              <p className="card-text">{currentFocus}</p>
            </div>
          )}

          {userStatedGoals.length > 0 && (
            <div className="summary-card unresolved">
              <span className="card-label">Unresolved Topics</span>
              <ul className="goals-list">
                {userStatedGoals.map((goal, idx) => (
                  <li key={idx}>{goal}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
