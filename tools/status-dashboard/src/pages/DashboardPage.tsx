import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { MetricCard } from '../components/metrics/MetricCard';
import { StageBadge } from '../components/metrics/StageBadge';
import { useDashboard } from '../hooks/useDashboard';

type Period = '24h' | '7d' | '30d';

const PERIOD_LABELS: Record<Period, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
};

const MODEL_COLORS: Record<string, string> = {
  Sonnet: '#3b82f6',
  Haiku: '#10b981',
  Titan: '#eab308',
};

const TOKEN_COLORS = {
  uncached: '#3b82f6',
  cacheRead: '#10b981',
  cacheWrite: '#eab308',
  output: '#8b5cf6',
};

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getModelColor(model: string): string {
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (model.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#6b7280';
}

function CostTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dashboard-tooltip">
      <div className="dashboard-tooltip-label">{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="dashboard-tooltip-item">
          <span className="dashboard-tooltip-dot" style={{ background: entry.color }} />
          <span>{entry.name}</span>
          <span className="dashboard-tooltip-value">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const { data, loading, error, refetch } = useDashboard(period);
  const navigate = useNavigate();

  if (loading && !data) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
        </div>
        <div className="dashboard-grid-metrics">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="metric-card skeleton" />
          ))}
        </div>
        <div className="dashboard-grid-charts">
          <div className="dashboard-chart-card skeleton" />
          <div className="dashboard-chart-card skeleton" />
        </div>
        <div className="dashboard-table-card skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
        </div>
        <div className="dashboard-error">
          <p>{error}</p>
          <button className="refresh-btn" onClick={refetch}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const costSparkline = data.costTrend.map(d => d.cost);
  const cacheSparkline = data.costTrend.map(d => {
    const total = d.cacheRead + d.cacheWrite + d.uncached;
    return total > 0 ? (d.cacheRead / total) * 100 : 0;
  });

  // Compute model distribution with percentages for pie chart
  const totalModelCount = data.modelDistribution.reduce((s, m) => s + m.count, 0);
  const pieData = data.modelDistribution.map(m => ({
    name: m.model,
    value: m.count,
    cost: m.cost,
    percentage: totalModelCount > 0 ? Math.round((m.count / totalModelCount) * 100) : 0,
  }));

  // Estimate cache savings (cached reads are ~90% cheaper)
  const totalCacheReadTokens = data.costTrend.reduce((s, d) => s + d.cacheRead, 0);
  const estimatedSavings = totalCacheReadTokens * 0.000003 * 0.9; // rough estimate

  return (
    <div className="dashboard-page">
      {/* Header with time range selector */}
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="period-selector">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              className={`period-btn ${p === period ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Top Row: 4 Metric Cards */}
      <div className="dashboard-grid-metrics">
        <MetricCard
          title="Active Sessions"
          value={data.activeSessions}
          subtitle={`${data.recentSessions.filter(s => s.status === 'ACTIVE' || s.status === 'WAITING').length} active in view`}
          onClick={() => navigate('/sessions')}
        />
        <MetricCard
          title="Period Cost"
          value={formatCost(data.periodCost)}
          sparklineData={costSparkline}
          color="#fbbf24"
          onClick={() => navigate('/costs')}
        />
        <MetricCard
          title="Cache Hit Rate"
          value={`${data.cacheHitRate.toFixed(1)}%`}
          subtitle={`saving ~${formatCost(estimatedSavings)}`}
          sparklineData={cacheSparkline}
          color="#10b981"
        />
        <MetricCard
          title="Avg Response"
          value={formatMs(data.avgResponseMs)}
          subtitle={`p95: ${formatMs(data.avgResponseMs * 1.8)}`}
        />
      </div>

      {/* Middle Row: Charts */}
      <div className="dashboard-grid-charts">
        {/* Cost Trend Stacked Bar Chart */}
        <div className="dashboard-chart-card">
          <h3>Cost Trend</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.costTrend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => {
                    const parts = v.split('-');
                    return `${parts[1]}/${parts[2]}`;
                  }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
                <Tooltip content={<CostTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '0.75rem', color: '#94a3b8' }}
                />
                <Bar dataKey="uncached" name="Standard Input" stackId="a" fill={TOKEN_COLORS.uncached} radius={[0, 0, 0, 0]} />
                <Bar dataKey="cacheRead" name="Cache Read" stackId="a" fill={TOKEN_COLORS.cacheRead} />
                <Bar dataKey="cacheWrite" name="Cache Write" stackId="a" fill={TOKEN_COLORS.cacheWrite} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Distribution Donut */}
        <div className="dashboard-chart-card">
          <h3>Model Distribution</h3>
          <div className="chart-container donut-container">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={getModelColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [`${value} calls`, name]}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <span className="donut-center-value">{totalModelCount}</span>
              <span className="donut-center-label">calls</span>
            </div>
            <div className="donut-legend">
              {pieData.map(m => (
                <div key={m.name} className="donut-legend-item">
                  <span className="donut-legend-dot" style={{ background: getModelColor(m.name) }} />
                  <span className="donut-legend-name">{m.name}</span>
                  <span className="donut-legend-pct">{m.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Recent Sessions Table */}
      <div className="dashboard-table-card">
        <h3>Recent Sessions</h3>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Participants</th>
              <th>Stage</th>
              <th>Turns</th>
              <th>Cost</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSessions.slice(0, 5).map(session => (
              <tr
                key={session.id}
                className="dashboard-table-row"
                onClick={() => navigate(`/sessions/${session.id}`)}
              >
                <td>
                  <span className={`status-dot ${session.status === 'ACTIVE' || session.status === 'WAITING' ? 'active' : 'inactive'}`} />
                </td>
                <td className="participants-cell">
                  {session.participants
                    ? session.participants
                    : <span style={{ color: 'var(--text-tertiary, #6b7280)', fontStyle: 'italic' }}>Deleted Users</span>
                  }
                </td>
                <td><StageBadge stage={session.stage} /></td>
                <td className="mono-cell">{session.turns}</td>
                <td className="mono-cell cost-cell">{formatCost(session.cost)}</td>
                <td className="age-cell">{timeAgo(session.age)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
