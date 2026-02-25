export interface CostSummary {
  periodTotal: number;
  previousPeriodTotal: number;
  changePercent: number;
  perSessionAvg: number;
  cacheSavings: number;
}

export interface CostTimelineEntry {
  date: string;
  sonnetCost: number;
  haikuCost: number;
  titanCost: number;
  total: number;
}

export interface ModelBreakdown {
  model: string;
  cost: number;
  count: number;
  inputTokens: number;
  outputTokens: number;
  percentage: number;
}

export interface CallTypeBreakdown {
  callType: string;
  cost: number;
  count: number;
  percentage: number;
  avgDuration: number;
}

export interface CacheMetrics {
  hitRate: number;
  readTokens: number;
  writeTokens: number;
  uncachedTokens: number;
  estimatedSavings: number;
}

export interface SessionCost {
  sessionId: string;
  participants: string;
  sonnetCost: number;
  haikuCost: number;
  titanCost: number;
  totalCost: number;
  activityCount: number;
  turnCount: number;
}

export interface CostParams {
  period: '24h' | '7d' | '30d';
  groupBy?: 'hour' | 'day';
  modelFilter?: string;
}

export interface CostAnalytics {
  summary: CostSummary;
  costTimeline: CostTimelineEntry[];
  modelBreakdown: ModelBreakdown[];
  callTypeBreakdown: CallTypeBreakdown[];
  cacheMetrics: CacheMetrics;
  sessionCosts: SessionCost[];
}

// A1: Cache Heatmap
export interface CacheHeatmapCell {
  stage: number;
  day: string;
  hitRate: number;
  totalTokens: number;
  cacheReadTokens: number;
}

export interface CacheHeatmapData {
  cells: CacheHeatmapCell[];
}

// A3: Cost by Stage
export interface StageCost {
  stage: number;
  sonnetCost: number;
  haikuCost: number;
  titanCost: number;
  totalCost: number;
}

export interface CostByStageData {
  stages: StageCost[];
}

// A4: Token Budget Context Window
export interface ContextWindow {
  pinnedTokens: number;
  summaryTokens: number;
  recentTokens: number;
  ragTokens: number;
  totalUsed: number;
  budgetLimit: number;
  utilizationPercent: number;
}

// A5: Cost Flow Sankey
export interface SankeyNode {
  name: string;
}

export interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

export interface CostFlowData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}
