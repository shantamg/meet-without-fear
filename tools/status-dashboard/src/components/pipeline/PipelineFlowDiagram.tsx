import { useMemo } from 'react';
import type { TurnTrace, TraceStep } from '../../types/trace';
import { PipelineNode } from './PipelineNode';

interface PipelineFlowDiagramProps {
  trace: TurnTrace;
}

interface LayoutNode {
  step: TraceStep;
  x: number;
  y: number;
  col: number;
  lane: number;
}

const NODE_WIDTH = 130;
const NODE_HEIGHT = 40;
const COL_GAP = 40;
const LANE_GAP = 10;
const PADDING = 20;

/**
 * Groups steps into columns. Steps with overlapping startMs values
 * are placed in the same column as parallel lanes.
 */
function layoutSteps(steps: TraceStep[]): { nodes: LayoutNode[]; width: number; height: number } {
  if (steps.length === 0) return { nodes: [], width: 200, height: 60 };

  // Sort by startMs
  const sorted = [...steps].sort((a, b) => a.startMs - b.startMs);

  // Group into columns: steps within 5ms of each other are parallel
  const columns: TraceStep[][] = [];
  let currentCol: TraceStep[] = [sorted[0]];
  let colStart = sorted[0].startMs;

  for (let i = 1; i < sorted.length; i++) {
    const step = sorted[i];
    // Consider steps parallel if they start within 5ms
    if (step.startMs - colStart <= 5) {
      currentCol.push(step);
    } else {
      columns.push(currentCol);
      currentCol = [step];
      colStart = step.startMs;
    }
  }
  columns.push(currentCol);

  // Layout nodes
  const nodes: LayoutNode[] = [];
  let maxLanes = 1;

  columns.forEach((col, colIdx) => {
    maxLanes = Math.max(maxLanes, col.length);
    col.forEach((step, laneIdx) => {
      nodes.push({
        step,
        x: PADDING + colIdx * (NODE_WIDTH + COL_GAP),
        y: PADDING + laneIdx * (NODE_HEIGHT + LANE_GAP),
        col: colIdx,
        lane: laneIdx,
      });
    });
  });

  const width = PADDING * 2 + columns.length * (NODE_WIDTH + COL_GAP) - COL_GAP;
  const height = PADDING * 2 + maxLanes * (NODE_HEIGHT + LANE_GAP) - LANE_GAP;

  return { nodes, width, height };
}

/**
 * Build edges between columns. Each node in column N connects to
 * every node in column N+1.
 */
function buildEdges(nodes: LayoutNode[]): Array<{ from: LayoutNode; to: LayoutNode }> {
  const byCol = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    const arr = byCol.get(n.col) || [];
    arr.push(n);
    byCol.set(n.col, arr);
  }

  const colNums = Array.from(byCol.keys()).sort((a, b) => a - b);
  const edges: Array<{ from: LayoutNode; to: LayoutNode }> = [];

  for (let i = 0; i < colNums.length - 1; i++) {
    const fromNodes = byCol.get(colNums[i])!;
    const toNodes = byCol.get(colNums[i + 1])!;

    // Connect last node in column to first node in next column
    // For parallel nodes, connect from all to all in next column
    for (const from of fromNodes) {
      for (const to of toNodes) {
        edges.push({ from, to });
      }
    }
  }

  return edges;
}

export function PipelineFlowDiagram({ trace }: PipelineFlowDiagramProps) {
  const { nodes, width, height } = useMemo(() => layoutSteps(trace.steps), [trace.steps]);
  const edges = useMemo(() => buildEdges(nodes), [nodes]);

  return (
    <div className="pipeline-flow-diagram">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Edges */}
        {edges.map((edge, i) => {
          const x1 = edge.from.x + NODE_WIDTH;
          const y1 = edge.from.y + NODE_HEIGHT / 2;
          const x2 = edge.to.x;
          const y2 = edge.to.y + NODE_HEIGHT / 2;
          const cx = (x1 + x2) / 2;

          return (
            <path
              key={i}
              className="pipeline-edge"
              d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => (
          <PipelineNode
            key={i}
            x={node.x}
            y={node.y}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            name={node.step.name}
            type={node.step.type}
            durationMs={node.step.durationMs}
            status={node.step.status}
            result={node.step.result}
          />
        ))}
      </svg>
    </div>
  );
}
