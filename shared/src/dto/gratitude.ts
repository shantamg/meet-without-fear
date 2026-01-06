/**
 * Gratitude Practice ("See the Positive") DTOs
 *
 * Data Transfer Objects for gratitude journaling feature.
 */

// ============================================================================
// Gratitude Entry
// ============================================================================

export interface GratitudeEntryDTO {
  id: string;
  content: string;
  voiceRecorded: boolean;
  createdAt: string; // ISO 8601
  aiResponse: string | null;
  metadata: GratitudeMetadataDTO | null;
}

export interface GratitudeMetadataDTO {
  people: string[];
  places: string[];
  activities: string[];
  emotions: string[];
  themes: string[];
  linkedNeedIds: number[];
  sentiment: number | null; // -1 to 1
}

// ============================================================================
// Gratitude Preferences
// ============================================================================

export interface GratitudePreferencesDTO {
  enabled: boolean;
  frequency: number; // 0-3 times per day
  preferredTimes: string[]; // Array of HH:MM
  weekdayOnly: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

// ============================================================================
// Gratitude Patterns
// ============================================================================

export interface GratitudePatternsDTO {
  topPeople: { name: string; count: number }[];
  topPlaces: { name: string; count: number }[];
  topActivities: { name: string; count: number }[];
  topThemes: { theme: string; count: number }[];
  needsConnections: { needId: number; needName: string; count: number }[];
  sentimentTrend: { date: string; avgScore: number }[];
  totalEntries: number;
  streakDays: number;
}

// ============================================================================
// API Requests/Responses
// ============================================================================

// POST /api/v1/gratitude
export interface CreateGratitudeRequest {
  content: string;
  voiceRecorded?: boolean;
}

export interface CreateGratitudeResponse {
  entry: GratitudeEntryDTO;
  aiResponse: string | null;
}

// GET /api/v1/gratitude
export interface ListGratitudeRequest {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface ListGratitudeResponse {
  entries: GratitudeEntryDTO[];
  total: number;
  hasMore: boolean;
}

// GET /api/v1/gratitude/:id
export interface GetGratitudeResponse {
  entry: GratitudeEntryDTO;
}

// DELETE /api/v1/gratitude/:id
export interface DeleteGratitudeResponse {
  success: boolean;
}

// GET /api/v1/gratitude/patterns
export interface GetGratitudePatternsRequest {
  period?: '7d' | '30d' | '90d' | 'all';
}

export interface GetGratitudePatternsResponse {
  patterns: GratitudePatternsDTO;
}

// GET /api/v1/gratitude/preferences
export interface GetGratitudePreferencesResponse {
  preferences: GratitudePreferencesDTO;
}

// PATCH /api/v1/gratitude/preferences
export interface UpdateGratitudePreferencesRequest {
  enabled?: boolean;
  frequency?: number;
  preferredTimes?: string[];
  weekdayOnly?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

export interface UpdateGratitudePreferencesResponse {
  preferences: GratitudePreferencesDTO;
}

// GET /api/v1/gratitude/prompt
export interface GetGratitudePromptResponse {
  prompt: string;
  context: 'high_needs' | 'mixed_needs' | 'low_needs' | 'recent_conflict' | 'first_entry' | 'general';
}
