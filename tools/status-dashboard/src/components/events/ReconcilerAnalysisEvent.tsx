/**
 * ReconcilerAnalysisEvent
 *
 * Displays reconciler analysis summary.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function ReconcilerAnalysisEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const summary = structured.summary || structured.analysisSummary;
  const conflicts = structured.conflicts || structured.detectedConflicts || [];
  const resolutions = structured.resolutions || structured.proposedResolutions || [];
  const status = structured.status || structured.reconciliationStatus;

  const conflictList = Array.isArray(conflicts) ? conflicts : [];
  const resolutionList = Array.isArray(resolutions) ? resolutions : [];

  const preview = summary
    ? (typeof summary === 'string' ? summary.substring(0, 100) : 'Analysis complete')
    : status
      ? `Status: ${status}`
      : conflictList.length > 0
        ? `${conflictList.length} conflict${conflictList.length !== 1 ? 's' : ''} found`
        : 'No conflicts';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Reconciler Analysis"
      icon="🤝"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {status && (
          <div className="detail-row">
            <span className="label">Status:</span>
            <span className="value chip">{status}</span>
          </div>
        )}

        {summary && (
          <div className="summary-section">
            <h4>Summary</h4>
            <p className="text-content">
              {typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2)}
            </p>
          </div>
        )}

        {conflictList.length > 0 && (
          <div className="conflicts-section">
            <h4>Detected Conflicts</h4>
            <ul className="conflict-list">
              {conflictList.map((conflict: any, index: number) => (
                <li key={index} className="conflict-item">
                  {typeof conflict === 'string' ? (
                    conflict
                  ) : (
                    <div className="conflict-detail">
                      <span className="conflict-type chip chip-warning">{conflict.type || 'Conflict'}</span>
                      <span className="conflict-description">{conflict.description || conflict.message}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resolutionList.length > 0 && (
          <div className="resolutions-section">
            <h4>Proposed Resolutions</h4>
            <ul className="resolution-list">
              {resolutionList.map((resolution: any, index: number) => (
                <li key={index} className="resolution-item">
                  {typeof resolution === 'string' ? resolution : resolution.description || resolution.action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
