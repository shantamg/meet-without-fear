import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api } from '../../services/api';
import type { StageCost } from '../../types/costs';

const MODEL_COLORS = {
  sonnet: '#3b82f6',
  haiku: '#10b981',
  titan: '#eab308',
};

const STAGE_LABELS: Record<number, string> = {
  0: 'Pre-Session',
  1: 'Feel Heard',
  2: 'Perspective',
  3: 'Needs',
  4: 'Resolution',
};

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function StageTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="cost-tooltip">
      <div className="cost-tooltip-label">{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="cost-tooltip-row">
          <span className="cost-tooltip-dot" style={{ background: entry.color }} />
          <span className="cost-tooltip-name">{entry.name}</span>
          <span className="cost-tooltip-value">{formatCost(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

interface CostByStageProps {
  period: '24h' | '7d' | '30d';
}

export function CostByStage({ period }: CostByStageProps) {
  const [stages, setStages] = useState<StageCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getCostByStage(period)
      .then(data => {
        if (!cancelled) setStages(data.stages);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  const chartData = useMemo(() => {
    return stages.map(s => ({
      ...s,
      name: STAGE_LABELS[s.stage] || `Stage ${s.stage}`,
    }));
  }, [stages]);

  if (loading) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cost by Stage</h2>
        <div className="cost-loading">Loading stage costs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cost by Stage</h2>
        <div className="cost-error"><p>{error}</p></div>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cost by Stage</h2>
        <div className="cost-loading">No stage data for this period</div>
      </div>
    );
  }

  return (
    <div className="cost-section">
      <h2 className="cost-section-title">Cost by Stage</h2>
      <div className="cost-chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis
              type="number"
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(v: number) => `$${v.toFixed(3)}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#64748b"
              fontSize={12}
              width={90}
            />
            <Tooltip content={<StageTooltip />} />
            <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
            <Bar dataKey="sonnetCost" name="Sonnet" stackId="cost" fill={MODEL_COLORS.sonnet} radius={[0, 0, 0, 0]} />
            <Bar dataKey="haikuCost" name="Haiku" stackId="cost" fill={MODEL_COLORS.haiku} radius={[0, 0, 0, 0]} />
            <Bar dataKey="titanCost" name="Titan" stackId="cost" fill={MODEL_COLORS.titan} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
