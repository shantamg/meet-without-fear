/**
 * ReferenceDetectionEvent
 *
 * Displays detected references in the conversation.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function ReferenceDetectionEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const references = structured.references || structured.detectedReferences || [];
  const hasReferences = structured.hasReferences ?? (Array.isArray(references) && references.length > 0);

  const refList = Array.isArray(references) ? references : [];
  const preview = hasReferences
    ? `${refList.length} reference${refList.length !== 1 ? 's' : ''} detected`
    : 'No references detected';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Reference Detection"
      icon="🔗"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        <div className="detail-row">
          <span className="label">References Found:</span>
          <span className={`value chip ${hasReferences ? 'chip-success' : 'chip-neutral'}`}>
            {hasReferences ? `Yes (${refList.length})` : 'None'}
          </span>
        </div>

        {refList.length > 0 && (
          <div className="references-list">
            <h4>Detected References</h4>
            <ul className="reference-items">
              {refList.map((ref: any, index: number) => (
                <li key={index} className="reference-item">
                  {typeof ref === 'string' ? (
                    <span className="reference-text">{ref}</span>
                  ) : (
                    <div className="reference-detail">
                      <span className="reference-type chip">{ref.type || 'reference'}</span>
                      <span className="reference-value">{ref.value || ref.text || ref.content}</span>
                      {ref.context && <span className="reference-context">{ref.context}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
