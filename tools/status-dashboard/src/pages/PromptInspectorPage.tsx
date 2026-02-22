import { useParams, Link } from 'react-router-dom';
import { usePromptDetail } from '../hooks/usePromptDetail';
import { ModelBadge } from '../components/metrics/ModelBadge';
import { RequestPanel } from '../components/prompt/RequestPanel';
import { ResponsePanel } from '../components/prompt/ResponsePanel';
import { MetadataPanel } from '../components/prompt/MetadataPanel';
import { FormattedPrice } from '../components/session/FormattedPrice';

export function PromptInspectorPage() {
  const { sessionId, activityId } = useParams<{ sessionId: string; activityId: string }>();
  const { data, loading, error } = usePromptDetail(activityId);

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
          <span className="prompt-call-type">{data.callType.replace(/_/g, ' ')}</span>
          <ModelBadge model={data.model} />
          <span className="prompt-header-cost">
            <FormattedPrice value={data.cost.totalCost} />
          </span>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="prompt-inspector-panels">
        <RequestPanel
          systemPrompt={data.systemPrompt}
          messages={data.messages}
          tokens={data.tokens}
        />
        <ResponsePanel response={data.response} />
        <MetadataPanel
          model={data.model}
          callType={data.callType}
          tokens={data.tokens}
          cost={data.cost}
          durationMs={data.durationMs}
        />
      </div>
    </div>
  );
}
