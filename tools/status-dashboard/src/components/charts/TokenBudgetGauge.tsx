import {
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import type { ContextWindow } from '../../types/costs';

const SEGMENT_COLORS = {
  pinned: '#3b82f6',
  summary: '#8b5cf6',
  recent: '#10b981',
  rag: '#eab308',
  unused: '#1e293b',
};

interface TokenBudgetGaugeProps {
  contextWindow: ContextWindow;
}

export function TokenBudgetGauge({ contextWindow }: TokenBudgetGaugeProps) {
  const { pinnedTokens, summaryTokens, recentTokens, ragTokens, totalUsed, budgetLimit, utilizationPercent } = contextWindow;
  const unused = Math.max(0, budgetLimit - totalUsed);

  const gaugeData = [
    { name: 'Pinned', value: pinnedTokens, fill: SEGMENT_COLORS.pinned },
    { name: 'Summary', value: summaryTokens, fill: SEGMENT_COLORS.summary },
    { name: 'Recent', value: recentTokens, fill: SEGMENT_COLORS.recent },
    { name: 'RAG', value: ragTokens, fill: SEGMENT_COLORS.rag },
    { name: 'Unused', value: unused, fill: SEGMENT_COLORS.unused },
  ].filter(d => d.value > 0);

  const utilizationColor = utilizationPercent >= 90 ? '#ef4444'
    : utilizationPercent >= 70 ? '#eab308'
    : '#10b981';

  return (
    <div className="meta-section">
      <div className="meta-section-label">Context Window</div>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy="85%"
              startAngle={180}
              endAngle={0}
              innerRadius={50}
              outerRadius={70}
              dataKey="value"
              stroke="none"
            >
              {gaugeData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            bottom: '18px',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: utilizationColor }}>
            {utilizationPercent.toFixed(0)}%
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            {totalUsed.toLocaleString()} / {budgetLimit.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="cache-stats" style={{ marginTop: '0.25rem' }}>
        <div className="cache-stat">
          <span className="cache-stat-dot" style={{ background: SEGMENT_COLORS.pinned }} />
          <span className="cache-stat-label">Pinned</span>
          <span className="cache-stat-value">{pinnedTokens.toLocaleString()}</span>
        </div>
        <div className="cache-stat">
          <span className="cache-stat-dot" style={{ background: SEGMENT_COLORS.summary }} />
          <span className="cache-stat-label">Summary</span>
          <span className="cache-stat-value">{summaryTokens.toLocaleString()}</span>
        </div>
        <div className="cache-stat">
          <span className="cache-stat-dot" style={{ background: SEGMENT_COLORS.recent }} />
          <span className="cache-stat-label">Recent</span>
          <span className="cache-stat-value">{recentTokens.toLocaleString()}</span>
        </div>
        <div className="cache-stat">
          <span className="cache-stat-dot" style={{ background: SEGMENT_COLORS.rag }} />
          <span className="cache-stat-label">RAG</span>
          <span className="cache-stat-value">{ragTokens.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
