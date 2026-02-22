import type { TraceStepType, TraceStepStatus } from '../../types/trace';

const NODE_COLORS: Record<TraceStepType, string> = {
  decision: '#6366f1',
  llm_call: '#f59e0b',
  retrieval: '#10b981',
  parsing: '#3b82f6',
  dispatch: '#ef4444',
};

interface PipelineNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  type: TraceStepType;
  durationMs: number;
  status: TraceStepStatus;
  result: string;
}

export function PipelineNode({ x, y, width, height, name, type, durationMs, status, result }: PipelineNodeProps) {
  const color = NODE_COLORS[type];
  const isSkipped = status === 'skipped';
  const isError = status === 'error';
  const opacity = isSkipped ? 0.4 : 1;
  const strokeColor = isError ? '#ef4444' : 'rgba(255,255,255,0.15)';

  return (
    <g className="pipeline-node-box" opacity={opacity}>
      <title>{`${name}: ${durationMs}ms — ${result}`}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke={strokeColor}
        strokeWidth={isError ? 2 : 1}
        rx={4}
        ry={4}
      />
      <text
        className="pipeline-node-label"
        x={x + width / 2}
        y={y + height / 2 - 4}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {name.length > 16 ? name.slice(0, 14) + '...' : name}
      </text>
      {durationMs > 0 && (
        <text
          className="pipeline-node-duration"
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {durationMs}ms
        </text>
      )}
    </g>
  );
}
