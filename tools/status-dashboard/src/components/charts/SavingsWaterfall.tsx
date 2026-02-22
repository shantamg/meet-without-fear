import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface SavingsWaterfallProps {
  periodTotal: number;
  cacheSavings: number;
}

interface WaterfallEntry {
  name: string;
  base: number;
  value: number;
  fill: string;
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload.find((p: any) => p.dataKey === 'value');
  if (!entry) return null;
  return (
    <div className="cost-tooltip">
      <div className="cost-tooltip-label">{entry.payload.name}</div>
      <div className="cost-tooltip-row">
        <span className="cost-tooltip-dot" style={{ background: entry.payload.fill }} />
        <span className="cost-tooltip-name">Cost</span>
        <span className="cost-tooltip-value">{formatCost(entry.value)}</span>
      </div>
    </div>
  );
}

export function SavingsWaterfall({ periodTotal, cacheSavings }: SavingsWaterfallProps) {
  const data = useMemo<WaterfallEntry[]>(() => {
    const baseline = periodTotal + cacheSavings;
    return [
      { name: 'Baseline', base: 0, value: baseline, fill: '#64748b' },
      { name: 'Cache Savings', base: periodTotal, value: cacheSavings, fill: '#10b981' },
      { name: 'Actual Cost', base: 0, value: periodTotal, fill: '#3b82f6' },
    ];
  }, [periodTotal, cacheSavings]);

  if (cacheSavings <= 0) return null;

  return (
    <div className="cost-section">
      <h2 className="cost-section-title">Savings Waterfall</h2>
      <div className="cost-chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              fontSize={12}
            />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(v: number) => `$${v.toFixed(3)}`}
            />
            <Tooltip content={<WaterfallTooltip />} cursor={false} />
            <Bar dataKey="base" stackId="waterfall" fill="transparent" />
            <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="breakdown-labels">
          <div className="breakdown-label-row">
            <span className="breakdown-dot" style={{ background: '#64748b' }} />
            <span className="breakdown-model">Without Caching</span>
            <span className="breakdown-cost">{formatCost(periodTotal + cacheSavings)}</span>
          </div>
          <div className="breakdown-label-row">
            <span className="breakdown-dot" style={{ background: '#10b981' }} />
            <span className="breakdown-model">Saved by Cache</span>
            <span className="breakdown-cost">-{formatCost(cacheSavings)}</span>
          </div>
          <div className="breakdown-label-row">
            <span className="breakdown-dot" style={{ background: '#3b82f6' }} />
            <span className="breakdown-model">Actual Cost</span>
            <span className="breakdown-cost">{formatCost(periodTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
