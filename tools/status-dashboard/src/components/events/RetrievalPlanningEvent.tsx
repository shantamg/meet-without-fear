/**
 * RetrievalPlanningEvent
 *
 * Displays retrieval planning decisions and planned retrievals.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function RetrievalPlanningEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const retrievals = structured.retrievals || structured.plannedRetrievals || structured.plans || [];
  const strategy = structured.strategy || structured.planningStrategy;
  const reasoning = structured.reasoning;

  const retrievalCount = Array.isArray(retrievals) ? retrievals.length : 0;
  const preview = `${retrievalCount} retrieval${retrievalCount !== 1 ? 's' : ''} planned${strategy ? ` (${strategy})` : ''}`;

  return (
    <BaseEventWrapper
      activity={activity}
      title="Retrieval Planning"
      icon="📚"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {strategy && (
          <div className="detail-row">
            <span className="label">Strategy:</span>
            <span className="value chip">{strategy}</span>
          </div>
        )}

        {Array.isArray(retrievals) && retrievals.length > 0 && (
          <div className="retrievals-list">
            <h4>Planned Retrievals</h4>
            <ul className="retrieval-items">
              {retrievals.map((retrieval: any, index: number) => (
                <li key={index} className="retrieval-item">
                  {typeof retrieval === 'string' ? (
                    retrieval
                  ) : (
                    <span>
                      <strong>{retrieval.type || retrieval.source || `Retrieval ${index + 1}`}</strong>
                      {retrieval.query && <span className="query"> - {retrieval.query}</span>}
                    </span>
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
