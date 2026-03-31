/**
 * Knowledge Base DTOs
 *
 * Data Transfer Objects for the knowledge base browse endpoints:
 * topics, topic timelines, and recurring themes.
 */

// ============================================================================
// Topic Browse (KNOW-01, KNOW-03, KNOW-04)
// ============================================================================

export interface TopicSessionEntryDTO {
  sessionId: string;
  title: string | null;
  createdAt: string; // ISO 8601
  takeaways: Array<{
    id: string;
    content: string;
    theme: string | null;
    type: 'INSIGHT' | 'ACTION_ITEM' | 'INTENTION';
    resolved: boolean;
  }>;
}

export interface KnowledgeBaseTopicDTO {
  tag: string;
  sessionCount: number;
  takeawayCount: number;
  lastActivity: string; // ISO 8601 — most recent session updatedAt
  sessions: TopicSessionEntryDTO[];
}

// GET /api/v1/knowledge-base/topics
export interface ListTopicsResponse {
  topics: KnowledgeBaseTopicDTO[];
}

// GET /api/v1/knowledge-base/topics/:tag
export interface GetTopicTimelineResponse {
  tag: string;
  sessions: TopicSessionEntryDTO[]; // Chronological (oldest first)
}

// ============================================================================
// Recurring Themes (INTEL-01, INTEL-03)
// ============================================================================

export interface RecurringThemeDTO {
  tag: string;
  sessionCount: number;
  summary: string;
  summaryAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// GET /api/v1/knowledge-base/themes
export interface ListRecurringThemesResponse {
  themes: RecurringThemeDTO[];
}

// ============================================================================
// Search (SEARCH-01, SEARCH-02, SEARCH-03)
// ============================================================================

export interface SearchResultDTO {
  takeawayId: string;
  content: string;
  theme: string | null;
  type: 'INSIGHT' | 'ACTION_ITEM' | 'INTENTION';
  sessionDate: string; // ISO 8601
  sessionId: string;
  similarity: number; // 0-1
}

// GET /api/v1/knowledge-base/search?q=<text>&limit=10
export interface SearchKnowledgeBaseResponse {
  results: SearchResultDTO[];
  query: string;
}

// ============================================================================
// Recent Takeaways (UI-03)
// ============================================================================

export interface RecentTakeawayDTO {
  id: string;
  content: string;
  theme: string | null;
  type: 'INSIGHT' | 'ACTION_ITEM' | 'INTENTION';
  sessionDate: string; // ISO 8601
  sessionId: string;
}

// GET /api/v1/knowledge-base/recent?limit=3
export interface RecentTakeawaysResponse {
  takeaways: RecentTakeawayDTO[];
}
