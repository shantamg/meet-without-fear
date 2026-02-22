export interface CostTrendEntry {
  date: string;
  cost: number;
  cacheRead: number;
  cacheWrite: number;
  uncached: number;
}

export interface ModelDistribution {
  model: string;
  count: number;
  cost: number;
}

export interface RecentSession {
  id: string;
  participants: string;
  status: string;
  stage: number;
  turns: number;
  cost: number;
  age: string;
}

export interface DashboardMetrics {
  activeSessions: number;
  periodCost: number;
  cacheHitRate: number;
  avgResponseMs: number;
  costTrend: CostTrendEntry[];
  modelDistribution: ModelDistribution[];
  recentSessions: RecentSession[];
}
