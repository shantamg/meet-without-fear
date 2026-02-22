import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useCostAnalytics } from '../hooks/useCostAnalytics';
import { MetricCard } from '../components/metrics/MetricCard';
import { exportSessionCostsToCSV } from '../utils/csvExport';
import type { SessionCost } from '../types/costs';

type Period = '24h' | '7d' | '30d';
type SortKey = 'participants' | 'turns' | 'sonnetCost' | 'haikuCost' | 'totalCost';
type SortDir = 'asc' | 'desc';

const MODEL_COLORS = {
  sonnet: '#3b82f6',
  haiku: '#10b981',
  titan: '#eab308',
};

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatCostPrecise(value: number): string {
  return `$${value.toFixed(6)}`;
}

function periodDays(period: Period): number {
  return period === '24h' ? 1 : period === '7d' ? 7 : 30;
}

// Custom tooltip for dark theme
function ChartTooltip({ active, payload, label }: any) {
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

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="cost-tooltip">
      <div className="cost-tooltip-row">
        <span className="cost-tooltip-dot" style={{ background: entry.payload.fill }} />
        <span className="cost-tooltip-name">{entry.name}</span>
        <span className="cost-tooltip-value">{entry.value.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function CostAnalysisPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const { data, loading, error } = useCostAnalytics(period);
  const [sortKey, setSortKey] = useState<SortKey>('totalCost');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const navigate = useNavigate();

  const sortedSessions = useMemo(() => {
    if (!data?.sessionCosts) return [];
    return [...data.sessionCosts].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data?.sessionCosts, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  // Cache efficiency timeline data
  const cacheTimeline = useMemo(() => {
    if (!data?.cacheMetrics) return [];
    const { readTokens, writeTokens, uncachedTokens } = data.cacheMetrics;
    const total = readTokens + writeTokens + uncachedTokens;
    if (total === 0) return [];
    return [
      { name: 'Cache Read', value: (readTokens / total) * 100, fill: '#10b981' },
      { name: 'Cache Write', value: (writeTokens / total) * 100, fill: '#eab308' },
      { name: 'Uncached', value: (uncachedTokens / total) * 100, fill: '#6b7280' },
    ];
  }, [data?.cacheMetrics]);

  const cacheDonutData = useMemo(() => {
    if (!data?.cacheMetrics) return [];
    const { hitRate } = data.cacheMetrics;
    return [
      { name: 'Cached', value: hitRate, fill: '#10b981' },
      { name: 'Uncached', value: 100 - hitRate, fill: '#334155' },
    ];
  }, [data?.cacheMetrics]);

  if (loading) {
    return (
      <div className="cost-page">
        <div className="cost-loading">Loading cost analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cost-page">
        <div className="cost-error">
          <p>Failed to load cost analytics</p>
          <p className="cost-error-detail">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, costTimeline, modelBreakdown, callTypeBreakdown, cacheMetrics } = data;
  const totalCostOfPotential = summary.periodTotal + summary.cacheSavings;
  const cacheSavingsPercent = totalCostOfPotential > 0
    ? ((summary.cacheSavings / totalCostOfPotential) * 100).toFixed(0)
    : '0';

  const uniqueSessions = data.sessionCosts.length;

  return (
    <div className="cost-page">
      {/* Header */}
      <div className="cost-page-header">
        <h1>Cost Analysis</h1>
        <div className="period-toggle">
          {(['24h', '7d', '30d'] as Period[]).map(p => (
            <button
              key={p}
              className={`period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="cost-summary-grid">
        <MetricCard
          title="Period Total"
          value={formatCost(summary.periodTotal)}
          subtitle={`over ${periodDays(period)} day${periodDays(period) > 1 ? 's' : ''}`}
          color="var(--color-cost)"
        />
        <MetricCard
          title="vs Previous Period"
          value={`${summary.changePercent >= 0 ? '+' : ''}${summary.changePercent.toFixed(1)}%`}
          delta={{
            value: Math.abs(summary.changePercent),
            isPositive: summary.changePercent <= 0,
          }}
          color={summary.changePercent <= 0 ? 'var(--color-success)' : 'var(--color-error)'}
        />
        <MetricCard
          title="Per Session Average"
          value={formatCost(summary.perSessionAvg)}
          subtitle={`across ${uniqueSessions} session${uniqueSessions !== 1 ? 's' : ''}`}
          color="var(--accent)"
        />
        <MetricCard
          title="Cache Savings"
          value={formatCost(summary.cacheSavings)}
          subtitle={`${cacheSavingsPercent}% of potential cost`}
          color="var(--color-success)"
        />
      </div>

      {/* Cost Over Time Chart */}
      <div className="cost-section">
        <h2 className="cost-section-title">Cost Over Time</h2>
        <div className="cost-chart-container">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={costTimeline}>
              <defs>
                <linearGradient id="gradSonnet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={MODEL_COLORS.sonnet} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={MODEL_COLORS.sonnet} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradHaiku" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={MODEL_COLORS.haiku} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={MODEL_COLORS.haiku} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradTitan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={MODEL_COLORS.titan} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={MODEL_COLORS.titan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }}
              />
              <Area
                type="monotone"
                dataKey="sonnetCost"
                name="Sonnet"
                stackId="1"
                stroke={MODEL_COLORS.sonnet}
                fill="url(#gradSonnet)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="haikuCost"
                name="Haiku"
                stackId="1"
                stroke={MODEL_COLORS.haiku}
                fill="url(#gradHaiku)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="titanCost"
                name="Titan"
                stackId="1"
                stroke={MODEL_COLORS.titan}
                fill="url(#gradTitan)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdown Section - 2 columns */}
      <div className="cost-breakdown-grid">
        {/* By Model */}
        <div className="cost-section">
          <h2 className="cost-section-title">By Model</h2>
          <div className="cost-chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={modelBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  stroke="#64748b"
                  fontSize={12}
                  width={60}
                  tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="cost" name="Cost" radius={[0, 4, 4, 0]}>
                  {modelBreakdown.map((entry) => (
                    <Cell
                      key={entry.model}
                      fill={MODEL_COLORS[entry.model as keyof typeof MODEL_COLORS] || '#6b7280'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="breakdown-labels">
              {modelBreakdown.map(m => (
                <div key={m.model} className="breakdown-label-row">
                  <span
                    className="breakdown-dot"
                    style={{ background: MODEL_COLORS[m.model as keyof typeof MODEL_COLORS] || '#6b7280' }}
                  />
                  <span className="breakdown-model">{m.model.charAt(0).toUpperCase() + m.model.slice(1)}</span>
                  <span className="breakdown-pct">{m.percentage.toFixed(1)}%</span>
                  <span className="breakdown-cost">{formatCost(m.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* By Call Type */}
        <div className="cost-section">
          <h2 className="cost-section-title">By Call Type</h2>
          <div className="cost-chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={callTypeBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                />
                <YAxis
                  type="category"
                  dataKey="callType"
                  stroke="#64748b"
                  fontSize={11}
                  width={120}
                  tickFormatter={(v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="cost" name="Cost" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="breakdown-labels">
              {callTypeBreakdown.map(ct => (
                <div key={ct.callType} className="breakdown-label-row">
                  <span className="breakdown-dot" style={{ background: '#8b5cf6' }} />
                  <span className="breakdown-model">
                    {ct.callType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span className="breakdown-pct">{ct.percentage.toFixed(1)}%</span>
                  <span className="breakdown-cost">{formatCost(ct.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cache Efficiency Section */}
      <div className="cost-section">
        <h2 className="cost-section-title">Cache Efficiency</h2>
        <div className="cache-grid">
          {/* Donut */}
          <div className="cache-donut-container">
            <h3 className="cache-subtitle">Cache Hit Rate</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={cacheDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  dataKey="value"
                  stroke="none"
                >
                  {cacheDonutData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="cache-donut-center">
              <span className="cache-donut-value">{cacheMetrics.hitRate.toFixed(1)}%</span>
              <span className="cache-donut-label">hit rate</span>
            </div>
          </div>

          {/* Token distribution bar */}
          <div className="cache-breakdown-container">
            <h3 className="cache-subtitle">Token Distribution</h3>
            <div className="cache-bar-chart">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cacheTimeline} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={12} width={90} />
                  <Tooltip content={<PieTooltip />} />
                  <Bar dataKey="value" name="Percentage" radius={[0, 4, 4, 0]}>
                    {cacheTimeline.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="cache-stats">
              <div className="cache-stat">
                <span className="cache-stat-dot" style={{ background: '#10b981' }} />
                <span className="cache-stat-label">Read</span>
                <span className="cache-stat-value">{cacheMetrics.readTokens.toLocaleString()} tokens</span>
              </div>
              <div className="cache-stat">
                <span className="cache-stat-dot" style={{ background: '#eab308' }} />
                <span className="cache-stat-label">Write</span>
                <span className="cache-stat-value">{cacheMetrics.writeTokens.toLocaleString()} tokens</span>
              </div>
              <div className="cache-stat">
                <span className="cache-stat-dot" style={{ background: '#6b7280' }} />
                <span className="cache-stat-label">Uncached</span>
                <span className="cache-stat-value">{cacheMetrics.uncachedTokens.toLocaleString()} tokens</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Session Cost Table */}
      <div className="cost-section">
        <div className="cost-section-header">
          <h2 className="cost-section-title">Cost by Session</h2>
          <button
            className="export-btn"
            onClick={() => exportSessionCostsToCSV(data.sessionCosts)}
          >
            Export CSV
          </button>
        </div>
        <div className="cost-table-wrapper">
          <table className="cost-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('participants')} className="sortable">
                  Session{sortIndicator('participants')}
                </th>
                <th onClick={() => handleSort('turns')} className="sortable">
                  Turns{sortIndicator('turns')}
                </th>
                <th onClick={() => handleSort('sonnetCost')} className="sortable">
                  Sonnet{sortIndicator('sonnetCost')}
                </th>
                <th onClick={() => handleSort('haikuCost')} className="sortable">
                  Haiku{sortIndicator('haikuCost')}
                </th>
                <th onClick={() => handleSort('totalCost')} className="sortable">
                  Total{sortIndicator('totalCost')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSessions.map((session: SessionCost) => (
                <tr
                  key={session.sessionId}
                  className="cost-table-row"
                  onClick={() => navigate(`/sessions/${session.sessionId}`)}
                >
                  <td className="session-name-cell">{session.participants}</td>
                  <td className="numeric-cell">{session.turns}</td>
                  <td className="cost-cell sonnet">{formatCostPrecise(session.sonnetCost)}</td>
                  <td className="cost-cell haiku">{formatCostPrecise(session.haikuCost)}</td>
                  <td className="cost-cell total">{formatCostPrecise(session.totalCost)}</td>
                </tr>
              ))}
              {sortedSessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-table">No session data for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
