import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrainActivity } from '../../types';
import { ModelBadge } from '../metrics/ModelBadge';
import { CacheIndicator } from '../metrics/CacheIndicator';
import { FormattedPrice } from './FormattedPrice';
import { formatDuration } from '../../utils/formatters';

interface SessionPromptsTabProps {
  activities: BrainActivity[];
  sessionId: string;
}

export function SessionPromptsTab({ activities, sessionId }: SessionPromptsTabProps) {
  const navigate = useNavigate();

  // Filter to LLM calls only, sorted by time
  const llmCalls = useMemo(() => {
    return activities
      .filter(a => a.activityType === 'LLM_CALL')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [activities]);

  if (llmCalls.length === 0) {
    return (
      <div className="session-prompts-tab">
        <div className="empty-section">No LLM calls found in this session.</div>
      </div>
    );
  }

  return (
    <div className="session-prompts-tab">
      <table className="prompts-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Call Type</th>
            <th>Model</th>
            <th>Duration</th>
            <th>Cost</th>
            <th>Cache</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {llmCalls.map((activity, i) => {
            const cacheRead = activity.metadata?.cacheReadInputTokens || 0;
            const isCached = cacheRead > 0;

            return (
              <tr
                key={activity.id}
                className="prompts-table-row"
                onClick={() => navigate(`/sessions/${sessionId}/prompt/${activity.id}`)}
              >
                <td className="prompts-col-num">{i + 1}</td>
                <td className="prompts-col-type">
                  {(activity.callType || activity.metadata?.operation || 'LLM Call').replace(/_/g, ' ')}
                </td>
                <td className="prompts-col-model">
                  {activity.model && <ModelBadge model={activity.model} />}
                </td>
                <td className="prompts-col-duration mono">
                  {activity.durationMs > 0 ? formatDuration(activity.durationMs) : '-'}
                </td>
                <td className="prompts-col-cost">
                  <FormattedPrice value={activity.cost} />
                </td>
                <td className="prompts-col-cache">
                  <CacheIndicator cached={isCached} />
                </td>
                <td className="prompts-col-status">
                  <span className={`status-dot ${activity.status.toLowerCase()}`}>
                    {activity.status === 'COMPLETED' && '✓'}
                    {activity.status === 'FAILED' && '✕'}
                    {activity.status === 'PENDING' && '↻'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
