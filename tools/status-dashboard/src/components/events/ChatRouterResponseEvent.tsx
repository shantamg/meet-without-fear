/**
 * ChatRouterResponseEvent
 *
 * Displays chat router decision and routing information.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function ChatRouterResponseEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const route = structured.route || structured.decision || structured.destination;
  const confidence = structured.confidence;
  const reasoning = structured.reasoning || structured.explanation;
  const alternatives = structured.alternatives || structured.otherRoutes;

  const preview = route
    ? `Route: ${route}${confidence ? ` (${(confidence * 100).toFixed(0)}%)` : ''}`
    : 'No routing decision';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Chat Router"
      icon="🔄"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {route && (
          <div className="detail-row">
            <span className="label">Routing Decision:</span>
            <span className="value chip chip-route">{route}</span>
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
          <div className="reasoning-section">
            <h4>Reasoning</h4>
            <p className="text-content">{reasoning}</p>
          </div>
        )}

        {Array.isArray(alternatives) && alternatives.length > 0 && (
          <div className="alternatives-section">
            <h4>Alternative Routes</h4>
            <ul className="alternatives-list">
              {alternatives.map((alt: any, index: number) => (
                <li key={index}>
                  {typeof alt === 'string' ? alt : `${alt.route || alt.name} (${(alt.confidence * 100).toFixed(0)}%)`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
