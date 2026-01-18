/**
 * PartnerSessionClassificationEvent
 *
 * Displays memory detection and session classification with chips for key metadata.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function PartnerSessionClassificationEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const memoryDetected = structured.memoryDetected ?? structured.hasMemory;
  const category = structured.category || structured.sessionCategory;
  const confidence = structured.confidence;
  const topicContext = structured.topicContext || structured.context || structured.topic;

  const preview = category
    ? `${category}${memoryDetected ? ' - Memory Detected' : ''}`
    : memoryDetected
      ? 'Memory Detected'
      : 'No classification';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Session Classification"
      icon="📋"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        <div className="classification-chips">
          {memoryDetected !== undefined && (
            <span className={`chip ${memoryDetected ? 'chip-success' : 'chip-neutral'}`}>
              {memoryDetected ? '✓ Memory Detected' : '✗ No Memory'}
            </span>
          )}

          {category && (
            <span className="chip chip-category">{category}</span>
          )}

          {confidence !== undefined && (
            <span className="chip chip-confidence">
              {(confidence * 100).toFixed(0)}% confidence
            </span>
          )}
        </div>

        {topicContext && (
          <div className="topic-context">
            <h4>Topic Context</h4>
            <p className="text-content">
              {typeof topicContext === 'string'
                ? topicContext
                : JSON.stringify(topicContext, null, 2)}
            </p>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
