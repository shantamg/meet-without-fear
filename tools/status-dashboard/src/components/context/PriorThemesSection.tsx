import React from 'react';
import { PriorThemes } from '../../types';

interface PriorThemesSectionProps {
  priorThemes?: PriorThemes;
}

/**
 * PriorThemesSection displays themes from previous sessions.
 * Shows last session date and session count.
 */
export function PriorThemesSection({ priorThemes }: PriorThemesSectionProps) {
  const hasThemes = priorThemes?.themes && priorThemes.themes.length > 0;
  const hasPriorSessions = priorThemes?.sessionCount && priorThemes.sessionCount > 0;

  return (
    <div className="context-section prior-themes">
      <div className="section-header">
        <h4>Prior Themes</h4>
        {hasPriorSessions && (
          <span className="session-count">{priorThemes.sessionCount} prior sessions</span>
        )}
      </div>

      <div className="section-content">
        {!hasThemes && !hasPriorSessions ? (
          <div className="empty-section">No prior session data</div>
        ) : (
          <div className="prior-themes-content">
            {priorThemes?.lastSessionDate && (
              <div className="last-session">
                <span className="label">Last session:</span>
                <span className="date">
                  {new Date(priorThemes.lastSessionDate).toLocaleDateString()}
                </span>
              </div>
            )}

            {hasThemes && (
              <div className="themes-list">
                {priorThemes!.themes.map((theme, idx) => (
                  <span key={idx} className="theme-chip prior">{theme}</span>
                ))}
              </div>
            )}

            {hasPriorSessions && !hasThemes && (
              <div className="no-themes-note">
                Themes not yet extracted from prior sessions
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
