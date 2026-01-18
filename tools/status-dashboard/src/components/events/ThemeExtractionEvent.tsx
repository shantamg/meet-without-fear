/**
 * ThemeExtractionEvent
 *
 * Displays extracted themes as a list.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function ThemeExtractionEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const themes = structured.themes || structured.extractedThemes || structured.identifiedThemes || [];
  const primaryTheme = structured.primaryTheme || structured.mainTheme;
  const confidence = structured.confidence;

  const themeList = Array.isArray(themes) ? themes : [];
  const preview = primaryTheme
    ? primaryTheme
    : themeList.length > 0
      ? themeList.slice(0, 3).map((t: any) => typeof t === 'string' ? t : t.name || t.theme).join(', ')
      : 'No themes extracted';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Theme Extraction"
      icon="🎨"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {primaryTheme && (
          <div className="primary-theme">
            <h4>Primary Theme</h4>
            <span className="chip chip-primary-theme">{primaryTheme}</span>
            {confidence !== undefined && (
              <span className="confidence-badge">{(confidence * 100).toFixed(0)}%</span>
            )}
          </div>
        )}

        {themeList.length > 0 && (
          <div className="themes-section">
            <h4>Extracted Themes</h4>
            <ul className="theme-list">
              {themeList.map((theme: any, index: number) => (
                <li key={index} className="theme-item">
                  {typeof theme === 'string' ? (
                    <span className="chip chip-theme">{theme}</span>
                  ) : (
                    <div className="theme-detail">
                      <span className="chip chip-theme">{theme.name || theme.theme || theme.value}</span>
                      {theme.confidence !== undefined && (
                        <span className="theme-confidence">({(theme.confidence * 100).toFixed(0)}%)</span>
                      )}
                      {theme.description && (
                        <span className="theme-description">{theme.description}</span>
                      )}
                      {theme.examples && Array.isArray(theme.examples) && theme.examples.length > 0 && (
                        <span className="theme-examples">
                          Examples: {theme.examples.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {themeList.length === 0 && !primaryTheme && (
          <div className="no-results">
            <p>No themes were extracted from this conversation segment.</p>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
