/**
 * BaseEventWrapper
 *
 * Shared wrapper for all event components providing consistent layout,
 * expand/collapse, and metadata display.
 */
import React, { useState } from 'react';
import { BrainActivity } from '../../types';
import { formatModelName, formatDuration } from '../../utils/formatters';
import { FormattedPrice } from '../session/FormattedPrice';
import { CacheIndicator } from '../metrics/CacheIndicator';
import { DetailBlock } from '../session/DetailBlock';

interface BaseEventWrapperProps {
  activity: BrainActivity;
  /** Display name for the event type */
  title: string;
  /** Icon to display */
  icon?: string;
  /** Whether to start expanded */
  defaultExpanded?: boolean;
  /** Custom preview text (shown in header) */
  preview?: string;
  /** Main content to render when expanded */
  children?: React.ReactNode;
  /** Whether to show raw input/output blocks */
  showRawData?: boolean;
}

export function BaseEventWrapper({
  activity,
  title,
  icon = '🔹',
  defaultExpanded = false,
  preview,
  children,
  showRawData = true,
}: BaseEventWrapperProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isError = activity.status === 'FAILED';
  const isPending = activity.status === 'PENDING';

  const modelDisplay = formatModelName(activity.model || undefined);
  const durationDisplay = activity.durationMs > 0 ? formatDuration(activity.durationMs) : '';
  const hasCacheHit = activity.metadata?.cacheReadInputTokens > 0;

  return (
    <div className={`event-item ${isError ? 'error' : ''} ${isPending ? 'pending' : ''}`}>
      <div className="event-header" onClick={() => setExpanded(!expanded)}>
        <span className="event-icon">{icon}</span>

        <div className="event-main-info">
          <div className="event-title-row">
            <span className="event-title">{title}</span>
            {preview && (
              <span className="event-preview" title={preview}>
                {preview}
              </span>
            )}
          </div>
          <div className="event-meta">
            {modelDisplay && <span className="meta-tag model">{modelDisplay}</span>}
            {durationDisplay && <span className="meta-tag duration">{durationDisplay}</span>}
            {hasCacheHit && <CacheIndicator cached={true} />}
          </div>
        </div>

        {activity.cost > 0 && (
          <div className="event-cost">
            <FormattedPrice value={activity.cost} />
          </div>
        )}

        <div className={`event-status ${activity.status.toLowerCase()}`} title={activity.status}>
          {activity.status === 'PENDING' && <span className="spinner">↻</span>}
          {activity.status === 'COMPLETED' && <span className="icon-success">✓</span>}
          {activity.status === 'FAILED' && <span className="icon-error">✕</span>}
        </div>

        <span className="event-toggle">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="event-body">
          {/* Custom content from child components */}
          {children}

          {/* Raw data blocks (optional) */}
          {showRawData && (
            <div className="event-raw-data">
              <DetailBlock title="Structured Output" data={activity.structuredOutput} defaultOpen={false} />
              <DetailBlock title="Metadata" data={activity.metadata} defaultOpen={false} />
              <DetailBlock title="Input" data={activity.input} defaultOpen={false} />
              <DetailBlock title="Output" data={activity.output} defaultOpen={false} />
            </div>
          )}

          {/* Token stats */}
          <div className="event-stats">
            <span>Tokens In: {activity.tokenCountInput}</span>
            <span>Tokens Out: {activity.tokenCountOutput}</span>
          </div>
        </div>
      )}
    </div>
  );
}
