import React, { useState, useMemo } from 'react';
import { BrainActivity } from '../../types';
import { formatModelName, formatDuration } from '../../utils/formatters';
import { getActivityIcon, getActivityPreview } from '../../utils/activityDisplay';
import { FormattedPrice } from './FormattedPrice';
import { DetailBlock } from './DetailBlock';
import { EventRenderer } from '../events/EventRenderer';

interface ActivityItemProps {
  activity: BrainActivity;
}

export function ActivityItem({ activity }: ActivityItemProps) {
  // If the activity has a typed callType, use the new EventRenderer
  if (activity.callType) {
    return <EventRenderer activity={activity} />;
  }

  // Legacy rendering for activities without callType
  return <LegacyActivityItem activity={activity} />;
}

/**
 * Legacy activity item rendering for backwards compatibility.
 * Used when activity.callType is not set.
 */
function LegacyActivityItem({ activity }: ActivityItemProps) {
  const [expanded, setExpanded] = useState(false);

  const isError = activity.status === 'FAILED';
  const isPending = activity.status === 'PENDING';
  const isEmbedding = activity.activityType === 'EMBEDDING';

  // Get pretty name and preview
  const { name, preview } = useMemo(() => getActivityPreview(activity), [activity]);

  const modelDisplay = formatModelName(activity.model || undefined);
  const durationDisplay = activity.durationMs > 0 ? formatDuration(activity.durationMs) : '';

  return (
    <div className={`log-step type-${activity.activityType} ${isError ? 'error' : ''} ${isPending ? 'pending' : ''}`}>
      <div className="step-header" onClick={() => setExpanded(!expanded)}>
        <span className="step-uicon">{getActivityIcon(activity.activityType)}</span>

        <div className="step-main-info">
          <div className="step-title-row">
            <span className="step-title">{name}</span>
            {preview && (
              <span className="step-preview" title={preview}>
                {preview}
              </span>
            )}
          </div>
          <div className="step-meta">
            {modelDisplay && <span className="meta-tag model">{modelDisplay}</span>}
            {durationDisplay && <span className="meta-tag duration">{durationDisplay}</span>}
          </div>
        </div>

        {activity.cost > 0 && (
          <div className="step-cost-preview">
            <FormattedPrice value={activity.cost} />
          </div>
        )}
        <div className={`step-status-icon ${activity.status.toLowerCase()}`} title={activity.status}>
          {activity.status === 'PENDING' && <span className="spinner">↻</span>}
          {activity.status === 'COMPLETED' && <span className="icon-success">✓</span>}
          {activity.status === 'FAILED' && <span className="icon-error">✕</span>}
        </div>
        <span className="step-toggle">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="step-body">
          <DetailBlock title="Metadata" data={activity.metadata} defaultOpen={false} />
          <DetailBlock title="Input" data={activity.input} defaultOpen={isEmbedding} />
          <DetailBlock title="Output" data={activity.output} defaultOpen={!isEmbedding} />
          {activity.activityType !== 'RETRIEVAL' && (
            <div className="stats-row" style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '0.85em', color: '#888' }}>
              <span>Tokens In: {activity.tokenCountInput}</span>
              <span>Tokens Out: {activity.tokenCountOutput}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
