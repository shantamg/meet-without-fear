import { ModelBadge } from '../metrics/ModelBadge';
import { formatDuration } from '../../utils/formatters';
import { TokenBudgetGauge } from '../charts/TokenBudgetGauge';
import type { TokenBreakdown, CostBreakdown } from '../../types/prompt';
import type { ContextWindow } from '../../types/costs';

interface MetadataPanelProps {
  model: string;
  callType: string;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
  durationMs: number;
  contextWindow?: ContextWindow;
}

function formatCost(value: number): string {
  return `$${value.toFixed(5)}`;
}

export function MetadataPanel({ model, callType, tokens, cost, durationMs, contextWindow }: MetadataPanelProps) {
  const totalInput = tokens.input;
  const cacheRatio = totalInput > 0 ? tokens.cacheRead / totalInput : 0;
  const cachePercent = (cacheRatio * 100).toFixed(0);

  return (
    <div className="prompt-panel metadata-panel">
      <h3 className="panel-title">Metadata</h3>

      {/* Model */}
      <div className="meta-section">
        <div className="meta-section-label">Model</div>
        <div className="meta-model-row">
          <ModelBadge model={model} />
          <span className="meta-model-id">{model}</span>
        </div>
      </div>

      {/* Timing */}
      <div className="meta-section">
        <div className="meta-section-label">Timing</div>
        <div className="meta-kv">
          <span className="meta-kv-label">Duration</span>
          <span className="meta-kv-value mono">{formatDuration(durationMs)}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Call Type</span>
          <span className="meta-kv-value">{callType.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* Token Counts */}
      <div className="meta-section">
        <div className="meta-section-label">Tokens</div>
        <div className="meta-kv">
          <span className="meta-kv-label">Input (total)</span>
          <span className="meta-kv-value mono">{tokens.input.toLocaleString()}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Output</span>
          <span className="meta-kv-value mono">{tokens.output.toLocaleString()}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Cache Read</span>
          <span className="meta-kv-value mono cached-value">{tokens.cacheRead.toLocaleString()}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Cache Write</span>
          <span className="meta-kv-value mono">{tokens.cacheWrite.toLocaleString()}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Uncached Input</span>
          <span className="meta-kv-value mono">{tokens.uncached.toLocaleString()}</span>
        </div>
      </div>

      {/* Cache Analysis Bar */}
      <div className="meta-section">
        <div className="meta-section-label">Cache Efficiency</div>
        <div className="cache-bar">
          <div className="cache-bar-track">
            <div
              className="cache-bar-fill cached"
              style={{ width: `${cachePercent}%` }}
            />
            <div
              className="cache-bar-fill uncached"
              style={{ width: `${100 - parseFloat(cachePercent)}%` }}
            />
          </div>
          <div className="cache-bar-labels">
            <span className="cache-bar-pct">{cachePercent}% cached</span>
          </div>
        </div>
      </div>

      {/* Context Window Gauge */}
      {contextWindow && (
        <TokenBudgetGauge contextWindow={contextWindow} />
      )}

      {/* Cost Breakdown */}
      <div className="meta-section">
        <div className="meta-section-label">Cost Breakdown</div>
        <div className="meta-kv">
          <span className="meta-kv-label">Uncached Input</span>
          <span className="meta-kv-value mono cost-val">{formatCost(cost.inputCost)}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Cache Read</span>
          <span className="meta-kv-value mono cost-val cached-value">{formatCost(cost.cacheReadCost)}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Cache Write</span>
          <span className="meta-kv-value mono cost-val">{formatCost(cost.cacheWriteCost)}</span>
        </div>
        <div className="meta-kv">
          <span className="meta-kv-label">Output</span>
          <span className="meta-kv-value mono cost-val">{formatCost(cost.outputCost)}</span>
        </div>
        <div className="meta-kv total">
          <span className="meta-kv-label">Total</span>
          <span className="meta-kv-value mono cost-total">{formatCost(cost.total)}</span>
        </div>
        {cost.savings > 0.00001 && (
          <div className="meta-savings">
            Savings from caching: {formatCost(cost.savings)}
          </div>
        )}
      </div>
    </div>
  );
}
