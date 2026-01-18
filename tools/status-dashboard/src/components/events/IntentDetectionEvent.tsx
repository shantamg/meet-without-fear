/**
 * IntentDetectionEvent
 *
 * Displays intent classification results with detected intent and confidence.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function IntentDetectionEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const intent = structured.intent || structured.detectedIntent || structured.classification;
  const confidence = structured.confidence || structured.score;
  const reasoning = structured.reasoning || structured.explanation;

  const preview = intent
    ? `${intent}${confidence ? ` (${(confidence * 100).toFixed(0)}%)` : ''}`
    : 'No intent detected';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Intent Detection"
      icon="🎯"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        <div className="intent-details">
          {intent && (
            <div className="detail-row">
              <span className="label">Detected Intent:</span>
              <span className="value chip intent-chip">{intent}</span>
            </div>
          )}

          {confidence !== undefined && (
            <div className="detail-row">
              <span className="label">Confidence:</span>
              <span className="value">
                <span className="confidence-bar">
                  <span
                    className="confidence-fill"
                    style={{ width: `${confidence * 100}%` }}
                  />
                </span>
                {(confidence * 100).toFixed(1)}%
              </span>
            </div>
          )}

          {reasoning && (
            <div className="detail-row reasoning">
              <span className="label">Reasoning:</span>
              <p className="value">{reasoning}</p>
            </div>
          )}
        </div>
      </div>
    </BaseEventWrapper>
  );
}
