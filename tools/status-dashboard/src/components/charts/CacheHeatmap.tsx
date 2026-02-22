import { useState, useEffect, useMemo, Fragment } from 'react';
import { api } from '../../services/api';
import { STAGE_LABELS } from '../../utils/chart-constants';
import type { CacheHeatmapCell } from '../../types/costs';

function hitRateColor(rate: number): string {
  if (rate >= 90) return '#10b981';
  if (rate >= 70) return '#34d399';
  if (rate >= 50) return '#eab308';
  if (rate >= 30) return '#f97316';
  return '#ef4444';
}

interface CacheHeatmapProps {
  period: '24h' | '7d' | '30d';
}

export function CacheHeatmap({ period }: CacheHeatmapProps) {
  const [cells, setCells] = useState<CacheHeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getCacheHeatmap(period)
      .then(data => {
        if (!cancelled) setCells(data.cells);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  const { stages, days, grid } = useMemo(() => {
    const stageSet = new Set<number>();
    const daySet = new Set<string>();
    const gridMap = new Map<string, CacheHeatmapCell>();

    for (const cell of cells) {
      stageSet.add(cell.stage);
      daySet.add(cell.day);
      gridMap.set(`${cell.stage}-${cell.day}`, cell);
    }

    const sortedStages = Array.from(stageSet).sort((a, b) => a - b);
    const sortedDays = Array.from(daySet).sort();

    return { stages: sortedStages, days: sortedDays, grid: gridMap };
  }, [cells]);

  if (loading) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cache Hit Rate by Stage</h2>
        <div className="cost-loading">Loading heatmap...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cache Hit Rate by Stage</h2>
        <div className="cost-error"><p>{error}</p></div>
      </div>
    );
  }

  if (cells.length === 0) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cache Hit Rate by Stage</h2>
        <div className="cost-loading">No data for this period</div>
      </div>
    );
  }

  return (
    <div className="cost-section">
      <h2 className="cost-section-title">Cache Hit Rate by Stage</h2>
      <div className="cost-chart-container">
        <div
          className="heatmap-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(${days.length}, 1fr)`,
            gap: '2px',
          }}
        >
          {/* Header row */}
          <div className="heatmap-header-cell" />
          {days.map(day => (
            <div key={day} className="heatmap-header-cell">
              {day.slice(5)}
            </div>
          ))}

          {/* Data rows */}
          {stages.map(stage => (
            <Fragment key={stage}>
              <div className="heatmap-row-label">
                {STAGE_LABELS[stage] || `Stage ${stage}`}
              </div>
              {days.map(day => {
                const cell = grid.get(`${stage}-${day}`);
                const rate = cell?.hitRate ?? 0;
                const tokens = cell?.totalTokens ?? 0;
                return (
                  <div
                    key={`${stage}-${day}`}
                    className="heatmap-cell"
                    style={{
                      backgroundColor: tokens > 0 ? hitRateColor(rate) : 'rgba(255,255,255,0.03)',
                      opacity: tokens > 0 ? 0.8 : 0.3,
                    }}
                    title={tokens > 0 ? `${rate.toFixed(1)}% hit rate (${tokens.toLocaleString()} tokens)` : 'No data'}
                  >
                    {tokens > 0 && (
                      <span className="heatmap-cell-value">{rate.toFixed(0)}%</span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>

        {/* Legend */}
        <div className="heatmap-legend">
          <span className="heatmap-legend-label">Low</span>
          <div className="heatmap-legend-gradient" />
          <span className="heatmap-legend-label">High</span>
        </div>
      </div>
    </div>
  );
}
