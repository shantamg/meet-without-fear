import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BrainActivity, SessionSummary } from '../../types';
import { MetricCard } from '../metrics/MetricCard';
import { formatModelName } from '../../utils/formatters';

interface SessionCostTabProps {
  activities: BrainActivity[];
  summary: SessionSummary | null;
}

export function SessionCostTab({ activities, summary }: SessionCostTabProps) {
  // Cost by model
  const modelCosts = useMemo(() => {
    const map = new Map<string, { cost: number; count: number; tokens: number }>();
    for (const act of activities) {
      const model = formatModelName(act.model || undefined) || 'Unknown';
      const existing = map.get(model) || { cost: 0, count: 0, tokens: 0 };
      existing.cost += act.cost;
      existing.count += 1;
      existing.tokens += act.tokenCountInput + act.tokenCountOutput;
      map.set(model, existing);
    }
    return Array.from(map.entries()).map(([model, data]) => ({ model, ...data }));
  }, [activities]);

  // Cost per turn (grouped by turnId)
  const turnCosts = useMemo(() => {
    const map = new Map<string, number>();
    let turnIndex = 0;
    for (const act of activities) {
      const key = act.turnId || `activity-${act.id}`;
      if (!map.has(key)) {
        turnIndex++;
      }
      map.set(key, (map.get(key) || 0) + act.cost);
    }
    return Array.from(map.entries()).map(([, cost], i) => ({
      turn: `T${i + 1}`,
      cost: parseFloat(cost.toFixed(5)),
    }));
  }, [activities]);

  // Cache efficiency
  const cacheStats = useMemo(() => {
    let totalCacheRead = 0;
    let totalInput = 0;
    let cachedCalls = 0;
    let totalCalls = 0;
    for (const act of activities) {
      if (act.activityType !== 'LLM_CALL') continue;
      totalCalls++;
      totalInput += act.tokenCountInput;
      const cacheRead = act.metadata?.cacheReadInputTokens || 0;
      totalCacheRead += cacheRead;
      if (cacheRead > 0) cachedCalls++;
    }
    return {
      hitRate: totalInput > 0 ? totalCacheRead / totalInput : 0,
      cachedCalls,
      totalCalls,
      totalCacheRead,
    };
  }, [activities]);

  return (
    <div className="session-cost-tab">
      {/* Summary Cards */}
      <div className="cost-summary-cards">
        <MetricCard
          title="Total Cost"
          value={`$${(summary?.totalCost || 0).toFixed(4)}`}
          color="var(--color-cost)"
        />
        <MetricCard
          title="Total Tokens"
          value={(summary?.totalTokens || 0).toLocaleString()}
          subtitle={`${activities.length} LLM calls`}
        />
        <MetricCard
          title="Cache Hit Rate"
          value={`${(cacheStats.hitRate * 100).toFixed(0)}%`}
          subtitle={`${cacheStats.cachedCalls}/${cacheStats.totalCalls} calls cached`}
          color="var(--color-success)"
        />
      </div>

      {/* Cost by Model */}
      <div className="cost-section">
        <h3 className="cost-section-title">Cost by Model</h3>
        <div className="cost-model-grid">
          {modelCosts.map(({ model, cost, count, tokens }) => (
            <div key={model} className="cost-model-card">
              <div className="cost-model-name">{model}</div>
              <div className="cost-model-value">${cost.toFixed(4)}</div>
              <div className="cost-model-detail">{count} calls / {tokens.toLocaleString()} tokens</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost per Turn Chart */}
      {turnCosts.length > 1 && (
        <div className="cost-section">
          <h3 className="cost-section-title">Cost per Turn</h3>
          <div className="cost-chart">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={turnCosts}>
                <XAxis dataKey="turn" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value) => [`$${Number(value).toFixed(5)}`, 'Cost']}
                />
                <Bar dataKey="cost" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
