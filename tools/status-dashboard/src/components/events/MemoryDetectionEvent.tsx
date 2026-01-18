/**
 * MemoryDetectionEvent
 *
 * Displays detected memory intents from the conversation.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function MemoryDetectionEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const memoryDetected = structured.memoryDetected ?? structured.hasMemory ?? structured.detected;
  const intents = structured.intents || structured.memoryIntents || structured.detectedIntents || [];
  const confidence = structured.confidence;
  const reasoning = structured.reasoning;

  const intentList = Array.isArray(intents) ? intents : [];
  const preview = memoryDetected
    ? `Memory detected${intentList.length > 0 ? ` (${intentList.length} intent${intentList.length !== 1 ? 's' : ''})` : ''}`
    : 'No memory detected';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Memory Detection"
      icon="💭"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        <div className="detail-row">
          <span className="label">Memory Detected:</span>
          <span className={`value chip ${memoryDetected ? 'chip-success' : 'chip-neutral'}`}>
            {memoryDetected ? 'Yes' : 'No'}
          </span>
          {confidence !== undefined && (
            <span className="confidence-badge">{(confidence * 100).toFixed(0)}%</span>
          )}
        </div>

        {intentList.length > 0 && (
          <div className="intents-section">
            <h4>Detected Intents</h4>
            <ul className="intent-list">
              {intentList.map((intent: any, index: number) => (
                <li key={index} className="intent-item">
                  {typeof intent === 'string' ? (
                    <span className="intent-text">{intent}</span>
                  ) : (
                    <div className="intent-detail">
                      <span className="intent-type chip">{intent.type || intent.category || 'intent'}</span>
                      <span className="intent-content">{intent.content || intent.value || intent.description}</span>
                      {intent.confidence && (
                        <span className="intent-confidence">({(intent.confidence * 100).toFixed(0)}%)</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reasoning && (
          <div className="reasoning-section">
            <h4>Reasoning</h4>
            <p className="text-content">{reasoning}</p>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
