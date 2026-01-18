/**
 * BackgroundClassificationEvent
 *
 * Displays background classification with themes and session metadata.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function BackgroundClassificationEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const themes = structured.themes || structured.identifiedThemes || [];
  const classification = structured.classification || structured.category;
  const sessionMetadata = structured.sessionMetadata || structured.metadata;
  const confidence = structured.confidence;

  const themeList = Array.isArray(themes) ? themes : [];
  const preview = classification
    ? classification
    : themeList.length > 0
      ? themeList.slice(0, 2).join(', ')
      : 'No classification';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Background Classification"
      icon="🏷️"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {classification && (
          <div className="detail-row">
            <span className="label">Classification:</span>
            <span className="value chip chip-classification">{classification}</span>
            {confidence !== undefined && (
              <span className="confidence-badge">{(confidence * 100).toFixed(0)}%</span>
            )}
          </div>
        )}

        {themeList.length > 0 && (
          <div className="themes-section">
            <h4>Themes</h4>
            <div className="theme-chips">
              {themeList.map((theme: string, index: number) => (
                <span key={index} className="chip chip-theme">{theme}</span>
              ))}
            </div>
          </div>
        )}

        {sessionMetadata && (
          <div className="metadata-section">
            <h4>Session Metadata</h4>
            <pre className="metadata-content">
              {typeof sessionMetadata === 'string'
                ? sessionMetadata
                : JSON.stringify(sessionMetadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
