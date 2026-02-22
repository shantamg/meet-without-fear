import { Session, BrainActivity, SessionSummary, ContextResponse, SessionFilters } from '../types';
import type { DashboardMetrics } from '../types/dashboard';
import type { CostParams, CostAnalytics } from '../types/costs';
import type { PromptDetail } from '../types/prompt';

/**
 * API response wrapper type.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Sessions list response.
 */
interface SessionsResponse {
  sessions: Session[];
}

/**
 * Session activity response.
 */
interface ActivityResponse {
  activities: BrainActivity[];
  messages: any[];
  summary: SessionSummary;
}

/**
 * API service for the status dashboard.
 * Centralizes all API calls with proper typing.
 */
export const api = {
  /**
   * Fetches all sessions.
   */
  async getSessions(cursor?: string, filters?: SessionFilters, limit?: number): Promise<{ sessions: Session[]; nextCursor?: string | null }> {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', String(limit));

    if (filters) {
      if (filters.search) params.append('search', filters.search);
      if (filters.status && filters.status.length > 0) params.append('status', filters.status.join(','));
      if (filters.type) params.append('type', filters.type);
      if (filters.stage && filters.stage.length > 0) params.append('stage', filters.stage.join(','));
      if (filters.sort) params.append('sort', filters.sort);
      if (filters.order) params.append('order', filters.order);
      if (filters.dateRange && filters.dateRange !== 'all') {
        const now = new Date();
        let from: Date;
        switch (filters.dateRange) {
          case 'today': from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
          case '7d': from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
          case '30d': from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
        }
        params.append('from', from!.toISOString());
      }
    }

    const res = await fetch(`/api/brain/sessions?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch sessions: ${res.statusText}`);
    }
    const json: ApiResponse<SessionsResponse & { nextCursor?: string | null }> = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to load sessions');
    }
    return json.data;
  },

  /**
   * Fetches a single session by ID.
   */
  async getSession(sessionId: string): Promise<Session | null> {
    // Currently there's no direct endpoint for a single session,
    // so we fetch all and filter
    const { sessions } = await this.getSessions();
    return sessions.find(s => s.id === sessionId) || null;
  },

  /**
   * Fetches activity for a specific session.
   */
  async getSessionActivity(sessionId: string): Promise<ActivityResponse> {
    const res = await fetch(`/api/brain/activity/${sessionId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch activity: ${res.statusText}`);
    }
    const json: ApiResponse<ActivityResponse> = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'API Error');
    }
    return {
      activities: json.data.activities || [],
      messages: json.data.messages || [],
      summary: json.data.summary || { totalCost: 0, totalTokens: 0 },
    };
  },

  /**
   * Fetches assembled context bundle for a session.
   * Returns context for all users in the session.
   */
  async getSessionContext(sessionId: string): Promise<ContextResponse> {
    const res = await fetch(`/api/brain/sessions/${sessionId}/context`);
    if (!res.ok) {
      throw new Error(`Failed to fetch context: ${res.statusText}`);
    }
    const json: ApiResponse<ContextResponse> = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to load context');
    }
    return json.data;
  },

  /**
   * Fetches dashboard overview metrics.
   */
  async getDashboard(period: '24h' | '7d' | '30d' = '24h'): Promise<DashboardMetrics> {
    const res = await fetch(`/api/brain/dashboard?period=${period}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch dashboard: ${res.statusText}`);
    }
    const json: ApiResponse<DashboardMetrics> = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to load dashboard');
    }
    return json.data;
  },

  /**
   * Fetches cost analytics data.
   */
  async getCosts(params: CostParams): Promise<CostAnalytics> {
    const searchParams = new URLSearchParams();
    searchParams.append('period', params.period);
    if (params.groupBy) searchParams.append('groupBy', params.groupBy);
    if (params.modelFilter) searchParams.append('modelFilter', params.modelFilter);

    const res = await fetch(`/api/brain/costs?${searchParams.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch costs: ${res.statusText}`);
    }
    const json: ApiResponse<CostAnalytics> = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to load costs');
    }
    return json.data;
  },

  /**
   * Fetches prompt detail for a specific activity.
   */
  async getPromptDetail(activityId: string): Promise<PromptDetail> {
    const res = await fetch(`/api/brain/activity/${activityId}/prompt`);
    if (!res.ok) {
      throw new Error(`Failed to fetch prompt detail: ${res.statusText}`);
    }
    const json: ApiResponse<PromptDetail> = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to load prompt detail');
    }
    return json.data;
  },
};

export type { ApiResponse, SessionsResponse, ActivityResponse };
