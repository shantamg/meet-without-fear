import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  delta?: { value: number; isPositive: boolean };
  sparklineData?: number[];
  color?: string;
  onClick?: () => void;
}

export function MetricCard({ title, value, subtitle, delta, sparklineData, color, onClick }: MetricCardProps) {
  return (
    <div
      className={`metric-card${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      style={color ? { borderTopColor: color, borderTopWidth: 2 } : undefined}
    >
      <div className="metric-card-title">{title}</div>
      <div className="metric-card-value" style={color ? { color } : undefined}>
        {value}
      </div>
      {subtitle && <div className="metric-card-subtitle">{subtitle}</div>}
      {delta && (
        <span className={`metric-card-delta ${delta.isPositive ? 'positive' : 'negative'}`}>
          {delta.isPositive ? '\u2191' : '\u2193'} {Math.abs(delta.value).toFixed(1)}%
        </span>
      )}
      {sparklineData && sparklineData.length > 1 && (
        <div className="metric-card-sparkline">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData.map((v, i) => ({ i, v }))}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={color || '#3b82f6'}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
