import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePromptDetail } from '../hooks/usePromptDetail';
import { ModelBadge } from '../components/metrics/ModelBadge';
import { RequestPanel } from '../components/prompt/RequestPanel';
import { ResponsePanel } from '../components/prompt/ResponsePanel';
import { MetadataPanel } from '../components/prompt/MetadataPanel';
import { PromptDiffViewer } from '../components/prompt/PromptDiffViewer';
import { FormattedPrice } from '../components/session/FormattedPrice';
import { api } from '../services/api';

export function PromptInspectorPage() {
  const { sessionId, activityId } = useParams<{ sessionId: string; activityId: string }>();
  const { data, loading, error } = usePromptDetail(activityId);
  const [diffState, setDiffState] = useState<{
    showing: boolean;
    loading: boolean;
    prevText: string | null;
    currentText: string | null;
    error: string | null;
  }>({ showing: false, loading: false, prevText: null, currentText: null, error: null });

  const handleCompare = useCallback(async () => {
    if (diffState.showing) {
      setDiffState(s => ({ ...s, showing: false }));
      return;
    }

    if (!sessionId || !activityId) return;

    setDiffState(s => ({ ...s, loading: true, error: null }));

    try {
      // Fetch session activities to find the previous LLM call
      const { activities } = await api.getSessionActivity(sessionId);
      const llmCalls = activities
        .filter(a => a.activityType === 'LLM_CALL')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const currentIdx = llmCalls.findIndex(a => a.id === activityId);
      if (currentIdx <= 0) {
        setDiffState(s => ({
          ...s,
          loading: false,
          error: 'No previous prompt to compare with (this is the first LLM call)',
        }));
        return;
      }

      const prevActivityId = llmCalls[currentIdx - 1].id;
      const prevDetail = await api.getPromptDetail(prevActivityId);

      const prevText = prevDetail.systemPrompt.blocks.map(b => b.content).join('\n\n---\n\n');
      const currentText = data!.systemPrompt.blocks.map(b => b.content).join('\n\n---\n\n');

      setDiffState({
        showing: true,
        loading: false,
        prevText,
        currentText,
        error: null,
      });
    } catch (err) {
      setDiffState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load previous prompt',
      }));
    }
  }, [sessionId, activityId, data, diffState.showing]);

  if (loading) {
    return <div className="loading" style={{ padding: '2rem' }}>Loading prompt detail...</div>;
  }

  if (error) {
    return <div className="error" style={{ padding: '2rem' }}>Error: {error}</div>;
  }

  if (!data) {
    return <div className="error" style={{ padding: '2rem' }}>Prompt not found</div>;
  }

  return (
    <div className="prompt-inspector">
      {/* Header */}
      <div className="prompt-inspector-header">
        <div className="prompt-inspector-nav">
          <Link to={`/sessions/${sessionId}`} className="prompt-back-link">
            ← Session Detail
          </Link>
        </div>
        <div className="prompt-inspector-meta">
          <button
            className={`prompt-compare-btn ${diffState.showing ? 'active' : ''}`}
            onClick={handleCompare}
            disabled={diffState.loading}
          >
            {diffState.loading ? 'Loading...' : diffState.showing ? 'Hide Diff' : 'Compare with previous'}
          </button>
          <span className="prompt-call-type">{data.timing.callType.replace(/_/g, ' ')}</span>
          <ModelBadge model={data.timing.model} />
          <span className="prompt-header-cost">
            <FormattedPrice value={data.cost.total} />
          </span>
        </div>
      </div>

      {/* Diff Error */}
      {diffState.error && (
        <div style={{ padding: '0.5rem 1.25rem', color: 'var(--color-warning)', fontSize: '0.8rem' }}>
          {diffState.error}
        </div>
      )}

      {/* Diff Viewer */}
      {diffState.showing && diffState.prevText !== null && diffState.currentText !== null && (
        <div style={{ padding: '0 1.25rem' }}>
          <PromptDiffViewer
            oldText={diffState.prevText}
            newText={diffState.currentText}
            onClose={() => setDiffState(s => ({ ...s, showing: false }))}
          />
        </div>
      )}

      {/* 3-Panel Layout */}
      <div className="prompt-inspector-panels">
        <RequestPanel
          systemPrompt={data.systemPrompt.blocks}
          messages={data.messages}
          tokens={data.tokens}
        />
        <ResponsePanel response={data.response} />
        <MetadataPanel
          model={data.timing.model}
          callType={data.timing.callType}
          tokens={data.tokens}
          cost={data.cost}
          durationMs={data.timing.durationMs}
        />
      </div>
    </div>
  );
}
