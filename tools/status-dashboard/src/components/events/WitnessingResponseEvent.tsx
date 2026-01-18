/**
 * WitnessingResponseEvent
 *
 * Displays witnessing response with preview.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function WitnessingResponseEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const response = structured.response || structured.text || structured.witnessing || activity.output;
  const emotionalTone = structured.emotionalTone || structured.tone;
  const acknowledgment = structured.acknowledgment || structured.validation;
  const reflection = structured.reflection;

  const responseText = typeof response === 'string' ? response : '';
  const preview = responseText.substring(0, 100) || 'Witnessing response generated';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Witnessing Response"
      icon="👁️"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {emotionalTone && (
          <div className="detail-row">
            <span className="label">Emotional Tone:</span>
            <span className="value chip chip-tone">{emotionalTone}</span>
          </div>
        )}

        {acknowledgment && (
          <div className="acknowledgment-section">
            <h4>Acknowledgment</h4>
            <p className="text-content">{acknowledgment}</p>
          </div>
        )}

        {responseText && (
          <div className="response-section">
            <h4>Response</h4>
            <p className="text-content witnessing-text">{responseText}</p>
          </div>
        )}

        {reflection && (
          <div className="reflection-section">
            <h4>Reflection</h4>
            <p className="text-content">{reflection}</p>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
