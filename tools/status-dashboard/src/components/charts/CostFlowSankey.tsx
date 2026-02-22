import { useState, useEffect, useMemo, Suspense } from 'react';
import { api } from '../../services/api';
import type { SankeyNode, SankeyLink } from '../../types/costs';

interface CostFlowSankeyProps {
  period: '24h' | '7d' | '30d';
}

interface LayoutNode {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  color: string;
  column: number;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  value: number;
  sy: number;
  ty: number;
  width: number;
}

const COLUMN_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#eab308'];

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function computeSankeyLayout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  width: number,
  height: number,
): { layoutNodes: LayoutNode[]; layoutLinks: LayoutLink[] } {
  if (nodes.length === 0) return { layoutNodes: [], layoutLinks: [] };

  // Determine columns by topological sort
  const nodeColumns = new Array(nodes.length).fill(0);
  const outLinks = new Map<number, number[]>();
  const inLinks = new Map<number, number[]>();

  for (const link of links) {
    if (!outLinks.has(link.source)) outLinks.set(link.source, []);
    outLinks.get(link.source)!.push(link.target);
    if (!inLinks.has(link.target)) inLinks.set(link.target, []);
    inLinks.get(link.target)!.push(link.source);
  }

  // BFS from sources to assign columns
  const visited = new Set<number>();
  const queue: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (!inLinks.has(i) || inLinks.get(i)!.length === 0) {
      queue.push(i);
      visited.add(i);
    }
  }

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const targets = outLinks.get(idx) || [];
    for (const t of targets) {
      nodeColumns[t] = Math.max(nodeColumns[t], nodeColumns[idx] + 1);
      if (!visited.has(t)) {
        visited.add(t);
        queue.push(t);
      }
    }
  }

  const maxCol = Math.max(...nodeColumns, 0);
  const nodeWidth = 16;
  const padding = 40;
  const colSpacing = maxCol > 0 ? (width - padding * 2 - nodeWidth) / maxCol : 0;

  // Compute node values
  const nodeValues = new Array(nodes.length).fill(0);
  for (const link of links) {
    nodeValues[link.source] = Math.max(nodeValues[link.source], nodeValues[link.source] || 0);
    nodeValues[link.source] += link.value;
  }
  // Also consider incoming values
  for (const link of links) {
    nodeValues[link.target] += link.value;
  }
  // Each node's value is max of incoming/outgoing
  for (let i = 0; i < nodes.length; i++) {
    const outSum = links.filter(l => l.source === i).reduce((s, l) => s + l.value, 0);
    const inSum = links.filter(l => l.target === i).reduce((s, l) => s + l.value, 0);
    nodeValues[i] = Math.max(outSum, inSum, 0.0001);
  }

  const availableHeight = height - padding * 2;

  // Group nodes by column and position them
  const columns = new Map<number, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    const col = nodeColumns[i];
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(i);
  }

  const layoutNodes: LayoutNode[] = nodes.map((node, i) => ({
    name: node.name,
    x: padding + nodeColumns[i] * colSpacing,
    y: 0,
    width: nodeWidth,
    height: 0,
    value: nodeValues[i],
    color: COLUMN_COLORS[nodeColumns[i] % COLUMN_COLORS.length],
    column: nodeColumns[i],
  }));

  // Position nodes within columns
  for (const [, indices] of columns) {
    const colTotal = indices.reduce((s, i) => s + nodeValues[i], 0);
    const gap = 8;
    const usableHeight = availableHeight - gap * (indices.length - 1);
    let y = padding;
    for (const i of indices) {
      const h = Math.max(4, (nodeValues[i] / colTotal) * usableHeight);
      layoutNodes[i].y = y;
      layoutNodes[i].height = h;
      y += h + gap;
    }
  }

  // Compute link positions
  const sourceOffsets = new Array(nodes.length).fill(0);
  const targetOffsets = new Array(nodes.length).fill(0);

  const layoutLinks: LayoutLink[] = links.map(link => {
    const source = layoutNodes[link.source];
    const target = layoutNodes[link.target];
    const linkWidth = (link.value / Math.max(nodeValues[link.source], 0.0001)) * source.height;
    const sy = source.y + sourceOffsets[link.source];
    const ty = target.y + targetOffsets[link.target];

    sourceOffsets[link.source] += linkWidth;
    targetOffsets[link.target] += (link.value / Math.max(nodeValues[link.target], 0.0001)) * target.height;

    return { source, target, value: link.value, sy, ty, width: Math.max(1, linkWidth) };
  });

  return { layoutNodes, layoutLinks };
}

function SankeyDiagram({ nodes, links, width, height }: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  width: number;
  height: number;
}) {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const { layoutNodes, layoutLinks } = useMemo(
    () => computeSankeyLayout(nodes, links, width, height),
    [nodes, links, width, height],
  );

  return (
    <svg width={width} height={height}>
      {/* Links */}
      {layoutLinks.map((link, i) => {
        const x0 = link.source.x + link.source.width;
        const x1 = link.target.x;
        const midX = (x0 + x1) / 2;

        const sourceIdx = layoutNodes.indexOf(link.source);
        const targetIdx = layoutNodes.indexOf(link.target);
        const isHighlighted = hoveredNode === sourceIdx || hoveredNode === targetIdx;
        const opacity = hoveredNode === null ? 0.25 : isHighlighted ? 0.5 : 0.05;

        return (
          <path
            key={`link-${i}`}
            d={`M${x0},${link.sy + link.width / 2}
                C${midX},${link.sy + link.width / 2}
                 ${midX},${link.ty + link.width / 2}
                 ${x1},${link.ty + link.width / 2}`}
            stroke={link.source.color}
            strokeWidth={link.width}
            fill="none"
            opacity={opacity}
          >
            <title>{`${link.source.name} → ${link.target.name}: ${formatCost(link.value)}`}</title>
          </path>
        );
      })}

      {/* Nodes */}
      {layoutNodes.map((node, i) => (
        <g
          key={`node-${i}`}
          onMouseEnter={() => setHoveredNode(i)}
          onMouseLeave={() => setHoveredNode(null)}
          style={{ cursor: 'pointer' }}
        >
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            fill={node.color}
            rx={2}
            opacity={hoveredNode === null || hoveredNode === i ? 0.9 : 0.3}
          />
          <text
            x={node.column === 0 ? node.x - 4 : node.x + node.width + 4}
            y={node.y + node.height / 2}
            textAnchor={node.column === 0 ? 'end' : 'start'}
            dominantBaseline="middle"
            fill="#94a3b8"
            fontSize={11}
            opacity={hoveredNode === null || hoveredNode === i ? 1 : 0.3}
          >
            {node.name}
          </text>
          <title>{`${node.name}: ${formatCost(node.value)}`}</title>
        </g>
      ))}
    </svg>
  );
}

function CostFlowSankeyInner({ period }: CostFlowSankeyProps) {
  const [nodes, setNodes] = useState<SankeyNode[]>([]);
  const [links, setLinks] = useState<SankeyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getCostFlow(period)
      .then(data => {
        if (!cancelled) {
          setNodes(data.nodes);
          setLinks(data.links);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  if (loading) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cost Flow</h2>
        <div className="cost-loading">Loading cost flow...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cost Flow</h2>
        <div className="cost-error"><p>{error}</p></div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="cost-section">
        <h2 className="cost-section-title">Cost Flow</h2>
        <div className="cost-loading">No flow data for this period</div>
      </div>
    );
  }

  return (
    <div className="cost-section">
      <h2 className="cost-section-title">Cost Flow</h2>
      <div className="cost-chart-container">
        <SankeyDiagram nodes={nodes} links={links} width={800} height={400} />
      </div>
    </div>
  );
}

export function CostFlowSankey(props: CostFlowSankeyProps) {
  return (
    <Suspense fallback={<div className="cost-loading">Loading chart...</div>}>
      <CostFlowSankeyInner {...props} />
    </Suspense>
  );
}
