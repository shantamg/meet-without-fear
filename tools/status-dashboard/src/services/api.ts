import { Session, BrainActivity, SessionSummary, ContextResponse } from '../types';

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
  async getSessions(cursor?: string): Promise<{ sessions: Session[]; nextCursor?: string | null }> {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);

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
};

export type { ApiResponse, SessionsResponse, ActivityResponse };
