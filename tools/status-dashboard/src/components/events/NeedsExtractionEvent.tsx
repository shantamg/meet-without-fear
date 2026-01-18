/**
 * NeedsExtractionEvent
 *
 * Displays extracted needs from the conversation.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function NeedsExtractionEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const needs = structured.needs || structured.extractedNeeds || structured.identifiedNeeds || [];
  const primaryNeed = structured.primaryNeed || structured.mainNeed;
  const urgency = structured.urgency || structured.priority;

  const needsList = Array.isArray(needs) ? needs : [];
  const preview = primaryNeed
    ? primaryNeed
    : needsList.length > 0
      ? `${needsList.length} need${needsList.length !== 1 ? 's' : ''} identified`
      : 'No needs extracted';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Needs Extraction"
      icon="💡"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {primaryNeed && (
          <div className="primary-need">
            <h4>Primary Need</h4>
            <p className="text-content highlighted">{primaryNeed}</p>
          </div>
        )}

        {urgency && (
          <div className="detail-row">
            <span className="label">Urgency:</span>
            <span className={`value chip chip-urgency-${urgency.toLowerCase()}`}>{urgency}</span>
          </div>
        )}

        {needsList.length > 0 && (
          <div className="needs-list-section">
            <h4>Extracted Needs</h4>
            <ul className="needs-list">
              {needsList.map((need: any, index: number) => (
                <li key={index} className="need-item">
                  {typeof need === 'string' ? (
                    <span className="need-text">{need}</span>
                  ) : (
                    <div className="need-detail">
                      <span className="need-category chip">{need.category || need.type || 'need'}</span>
                      <span className="need-description">{need.description || need.text || need.value}</span>
                      {need.priority && (
                        <span className={`need-priority chip chip-priority-${need.priority.toLowerCase()}`}>
                          {need.priority}
                        </span>
                      )}
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
