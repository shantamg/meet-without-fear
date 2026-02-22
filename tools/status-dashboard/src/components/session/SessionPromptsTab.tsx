import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrainActivity } from '../../types';
import { ModelBadge } from '../metrics/ModelBadge';
import { CacheIndicator } from '../metrics/CacheIndicator';
import { FormattedPrice } from './FormattedPrice';
import { PromptDiffViewer } from '../prompt/PromptDiffViewer';
import { formatDuration } from '../../utils/formatters';
import { api } from '../../services/api';

interface SessionPromptsTabProps {
  activities: BrainActivity[];
  sessionId: string;
}

interface DiffState {
  betweenIndex: number;
  loading: boolean;
  oldText: string | null;
  newText: string | null;
  error: string | null;
}

export function SessionPromptsTab({ activities, sessionId }: SessionPromptsTabProps) {
  const navigate = useNavigate();
  const [diffState, setDiffState] = useState<DiffState | null>(null);

  const llmCalls = useMemo(() => {
    return activities
      .filter(a => a.activityType === 'LLM_CALL')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [activities]);

  const handleDiff = useCallback(async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (diffState && diffState.betweenIndex === index) {
      setDiffState(null);
      return;
    }

    const oldActivity = llmCalls[index];
    const newActivity = llmCalls[index + 1];

    setDiffState({ betweenIndex: index, loading: true, oldText: null, newText: null, error: null });

    try {
      const [oldDetail, newDetail] = await Promise.all([
        api.getPromptDetail(oldActivity.id),
        api.getPromptDetail(newActivity.id),
      ]);

      const oldText = oldDetail.systemPrompt.blocks.map(b => b.content).join('\n\n---\n\n');
      const newText = newDetail.systemPrompt.blocks.map(b => b.content).join('\n\n---\n\n');

      setDiffState({ betweenIndex: index, loading: false, oldText, newText, error: null });
    } catch (err) {
      setDiffState({
        betweenIndex: index,
        loading: false,
        oldText: null,
        newText: null,
        error: err instanceof Error ? err.message : 'Failed to load prompts',
      });
    }
  }, [llmCalls, diffState]);

  if (llmCalls.length === 0) {
    return (
      <div className="session-prompts-tab">
        <div className="empty-section">No LLM calls found in this session.</div>
      </div>
    );
  }

  const rows: React.JSX.Element[] = [];
  llmCalls.forEach((activity, i) => {
    const cacheRead = activity.metadata?.cacheReadInputTokens || 0;
    const isCached = cacheRead > 0;
    const showDiffBelow = diffState && diffState.betweenIndex === i;

    rows.push(
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
        <td>
          {i < llmCalls.length - 1 && (
            <button
              className="prompts-diff-btn"
              onClick={(e) => handleDiff(i, e)}
            >
              {showDiffBelow ? 'Hide' : 'Diff'}
            </button>
          )}
        </td>
      </tr>
    );

    if (showDiffBelow) {
      rows.push(
        <tr key={`diff-${activity.id}`}>
          <td colSpan={8} style={{ padding: '0.5rem' }}>
            {diffState.loading && (
              <div className="loading" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem' }}>
                Loading diff...
              </div>
            )}
            {diffState.error && (
              <div style={{ padding: '0.5rem', color: 'var(--color-error)', fontSize: '0.8rem' }}>
                {diffState.error}
              </div>
            )}
            {diffState.oldText !== null && diffState.newText !== null && (
              <PromptDiffViewer
                oldText={diffState.oldText}
                newText={diffState.newText}
                onClose={() => setDiffState(null)}
              />
            )}
          </td>
        </tr>
      );
    }
  });

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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    </div>
  );
}
