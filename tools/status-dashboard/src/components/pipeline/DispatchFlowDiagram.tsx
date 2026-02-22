interface DispatchFlowDiagramProps {
  dispatchTag: string;
  durationMs?: number;
}

const BOX_W = 120;
const BOX_H = 32;
const GAP = 30;
const PADDING = 10;

interface FlowNode {
  label: string;
  color: string;
  x: number;
  y: number;
}

export function DispatchFlowDiagram({ dispatchTag, durationMs }: DispatchFlowDiagramProps) {
  const cy = PADDING + BOX_H / 2;

  const nodes: FlowNode[] = [
    { label: 'AI Response', color: '#6366f1', x: PADDING, y: PADDING },
    { label: 'Dispatch', color: '#f59e0b', x: PADDING + BOX_W + GAP, y: PADDING },
    { label: dispatchTag, color: '#ef4444', x: PADDING + (BOX_W + GAP) * 2, y: PADDING },
    { label: 'Sonnet Call', color: '#f59e0b', x: PADDING + (BOX_W + GAP) * 3, y: PADDING },
    { label: 'Final Response', color: '#10b981', x: PADDING + (BOX_W + GAP) * 4, y: PADDING },
  ];

  const totalWidth = PADDING * 2 + BOX_W * 5 + GAP * 4;
  const totalHeight = PADDING * 2 + BOX_H;

  return (
    <div className="dispatch-flow-diagram">
      <svg width={totalWidth} height={totalHeight} viewBox={`0 0 ${totalWidth} ${totalHeight}`}>
        {/* Edges */}
        {nodes.slice(0, -1).map((node, i) => {
          const next = nodes[i + 1];
          return (
            <line
              key={i}
              x1={node.x + BOX_W}
              y1={cy}
              x2={next.x}
              y2={cy}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1.5}
              markerEnd="url(#dispatch-arrow)"
            />
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker
            id="dispatch-arrow"
            viewBox="0 0 10 10"
            refX={10}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.3)" />
          </marker>
        </defs>

        {/* Nodes */}
        {nodes.map((node, i) => (
          <g key={i}>
            <rect
              x={node.x}
              y={node.y}
              width={BOX_W}
              height={BOX_H}
              fill={node.color}
              rx={4}
              ry={4}
              opacity={0.85}
            />
            <text
              x={node.x + BOX_W / 2}
              y={node.y + BOX_H / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize={10}
              fontFamily="inherit"
            >
              {node.label.length > 14 ? node.label.slice(0, 12) + '..' : node.label}
            </text>
          </g>
        ))}

        {/* Duration label */}
        {durationMs !== undefined && (
          <text
            x={totalWidth / 2}
            y={totalHeight - 2}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize={9}
            fontFamily="inherit"
          >
            {durationMs}ms
          </text>
        )}
      </svg>
    </div>
  );
}
