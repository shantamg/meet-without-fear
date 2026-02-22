import { useState } from 'react';

interface TokenBarProps {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function TokenBar({ input, output, cacheRead, cacheWrite }: TokenBarProps) {
  const [hovered, setHovered] = useState(false);
  const total = input + output + cacheRead + cacheWrite;

  if (total === 0) return null;

  const pct = (v: number) => ((v / total) * 100).toFixed(1);

  const segments = [
    { key: 'input', value: input, label: 'Input' },
    { key: 'output', value: output, label: 'Output' },
    { key: 'cache-read', value: cacheRead, label: 'Cache Read' },
    { key: 'cache-write', value: cacheWrite, label: 'Cache Write' },
  ].filter((s) => s.value > 0);

  return (
    <div
      className="token-bar-container"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="token-bar">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`token-bar-segment ${s.key}`}
            style={{ width: `${pct(s.value)}%` }}
            title={`${s.label}: ${s.value.toLocaleString()} (${pct(s.value)}%)`}
          />
        ))}
      </div>
      {hovered && (
        <div className="token-bar-legend">
          {segments.map((s) => (
            <span key={s.key} className="token-bar-legend-item">
              <span className={`token-bar-legend-dot token-bar-segment ${s.key}`} />
              {s.label}: {pct(s.value)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
