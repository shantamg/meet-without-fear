/**
 * Meditation ("Develop Loving Awareness") DTOs
 *
 * Data Transfer Objects for guided and unguided meditation features.
 */

import { MeditationType, FavoriteType } from '../enums';

// ============================================================================
// Meditation Session
// ============================================================================

export interface MeditationSessionDTO {
  id: string;
  type: MeditationType;
  durationMinutes: number;
  focusArea: string | null;
  completed: boolean;
  startedAt: string; // ISO 8601
  completedAt: string | null;
  scriptGenerated: string | null;
  voiceId: string | null;
  backgroundSound: string | null;
  savedAsFavorite: boolean;
  favoriteType: FavoriteType | null;
  postNotes: string | null;
}

export interface MeditationSessionSummaryDTO {
  id: string;
  type: MeditationType;
  durationMinutes: number;
  focusArea: string | null;
  completed: boolean;
  startedAt: string;
  completedAt: string | null;
}

// ============================================================================
// Meditation Stats
// ============================================================================

export interface MeditationStatsDTO {
  totalSessions: number;
  guidedCount: number;
  unguidedCount: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  streakStartDate: string | null;
  lastSessionDate: string | null;
  favoriteFocusAreas: { focusArea: string; count: number }[];
}

// ============================================================================
// Meditation Favorites
// ============================================================================

export interface MeditationFavoriteDTO {
  id: string;
  name: string;
  focusArea: string;
  durationMinutes: number;
  favoriteType: FavoriteType;
  script: string | null; // Only for EXACT type
  savedAt: string;
}

// ============================================================================
// Meditation Preferences
// ============================================================================

export interface MeditationPreferencesDTO {
  preferredVoice: string;
  voiceSpeed: number; // 0.8 - 1.2
  defaultDuration: number;
  backgroundSound: string;
  reminderEnabled: boolean;
  reminderTime: string | null;
}

// ============================================================================
// API Requests/Responses
// ============================================================================

// POST /api/v1/meditation/sessions
export interface CreateMeditationSessionRequest {
  type: MeditationType;
  durationMinutes: number;
  focusArea?: string;
  voiceId?: string;
  backgroundSound?: string;
}

export interface CreateMeditationSessionResponse {
  session: MeditationSessionDTO;
  script?: string; // For guided - the generated script
}

// PATCH /api/v1/meditation/sessions/:id
export interface UpdateMeditationSessionRequest {
  completed?: boolean;
  postNotes?: string;
  savedAsFavorite?: boolean;
  favoriteType?: FavoriteType;
}

export interface UpdateMeditationSessionResponse {
  session: MeditationSessionDTO;
}

// GET /api/v1/meditation/sessions
export interface ListMeditationSessionsRequest {
  limit?: number;
  offset?: number;
  type?: MeditationType;
}

export interface ListMeditationSessionsResponse {
  sessions: MeditationSessionSummaryDTO[];
  total: number;
  hasMore: boolean;
}

// POST /api/v1/meditation/suggest
export interface GetMeditationSuggestionResponse {
  suggestedFocus: string;
  reasoning: string;
  suggestedDuration: number;
}

// POST /api/v1/meditation/generate-script
export interface GenerateScriptRequest {
  focusArea: string;
  durationMinutes: number;
  context?: {
    preparingForConflict?: boolean;
    recentEmotions?: string[];
    lowNeeds?: string[];
  };
}

export interface GenerateScriptResponse {
  script: string;
  estimatedMinutes: number;
}

// GET /api/v1/meditation/stats
export interface GetMeditationStatsResponse {
  stats: MeditationStatsDTO;
}

// GET /api/v1/meditation/favorites
export interface ListMeditationFavoritesResponse {
  favorites: MeditationFavoriteDTO[];
}

// POST /api/v1/meditation/favorites
export interface CreateMeditationFavoriteRequest {
  sessionId: string;
  name?: string;
}

export interface CreateMeditationFavoriteResponse {
  favorite: MeditationFavoriteDTO;
}

// DELETE /api/v1/meditation/favorites/:id
export interface DeleteMeditationFavoriteResponse {
  success: boolean;
}

// GET /api/v1/meditation/preferences
export interface GetMeditationPreferencesResponse {
  preferences: MeditationPreferencesDTO;
}

// PATCH /api/v1/meditation/preferences
export interface UpdateMeditationPreferencesRequest {
  preferredVoice?: string;
  voiceSpeed?: number;
  defaultDuration?: number;
  backgroundSound?: string;
  reminderEnabled?: boolean;
  reminderTime?: string | null;
}

export interface UpdateMeditationPreferencesResponse {
  preferences: MeditationPreferencesDTO;
}

// ============================================================================
// Saved Meditations (Custom User-Created)
// ============================================================================

export interface SavedMeditationDTO {
  id: string;
  title: string;
  script: string; // Full script with [PAUSE:Xs] tokens
  durationSeconds: number;
  conversationId: string | null; // Link to chat that created it
  createdAt: string;
  updatedAt: string;
}

export interface SavedMeditationSummaryDTO {
  id: string;
  title: string;
  durationSeconds: number;
  createdAt: string;
}

// GET /api/v1/meditation/saved
export interface ListSavedMeditationsResponse {
  meditations: SavedMeditationSummaryDTO[];
  total: number;
}

// GET /api/v1/meditation/saved/:id
export interface GetSavedMeditationResponse {
  meditation: SavedMeditationDTO;
}

// POST /api/v1/meditation/saved
export interface CreateSavedMeditationRequest {
  title: string;
  script: string;
  conversationId?: string;
}

export interface CreateSavedMeditationResponse {
  meditation: SavedMeditationDTO;
}

// PATCH /api/v1/meditation/saved/:id
export interface UpdateSavedMeditationRequest {
  title?: string;
  script?: string;
}

export interface UpdateSavedMeditationResponse {
  meditation: SavedMeditationDTO;
}

// DELETE /api/v1/meditation/saved/:id
export interface DeleteSavedMeditationResponse {
  success: boolean;
}

// POST /api/v1/meditation/parse
export interface ParseMeditationTextRequest {
  text: string;
}

export interface ParseMeditationTextResponse {
  script: string; // Converted script with [PAUSE:Xs] tokens
  durationSeconds: number;
  suggestedTitle: string;
  hasAmbiguousPauses: boolean; // If AI couldn't determine timing
  ambiguityQuestions?: string[]; // Follow-up questions if ambiguous
}

// ============================================================================
// Duration Options
// ============================================================================

export const MEDITATION_DURATIONS = [5, 10, 15, 20, 30, 45, 60] as const;
export type MeditationDuration = (typeof MEDITATION_DURATIONS)[number];

// ============================================================================
// Background Sound Options
// ============================================================================

export const BACKGROUND_SOUNDS = ['silence', 'rain', 'bowls', 'nature'] as const;
export type BackgroundSound = (typeof BACKGROUND_SOUNDS)[number];
