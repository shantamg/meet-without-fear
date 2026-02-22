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
  turns: number;
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
