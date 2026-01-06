/**
 * Needs Assessment ("Am I OK?") DTOs
 *
 * Data Transfer Objects for the 19 core human needs assessment system.
 */

import { NeedsCategory } from '../enums';

// ============================================================================
// Need (Reference Data)
// ============================================================================

export interface NeedDTO {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: NeedsCategory;
  order: number;
}

// ============================================================================
// Need Score
// ============================================================================

export interface NeedScoreDTO {
  id: string;
  needId: number;
  score: number; // 0 = Not met, 1 = Somewhat met, 2 = Fully met
  clarification: string | null;
  createdAt: string; // ISO 8601
}

export interface NeedWithScoreDTO extends NeedDTO {
  currentScore: number | null;
  lastScoreDate: string | null;
  trend: 'up' | 'down' | 'stable' | null;
}

// ============================================================================
// Needs Assessment State
// ============================================================================

export interface NeedsAssessmentStateDTO {
  baselineCompleted: boolean;
  baselineCompletedAt: string | null;
  checkInFrequencyDays: number;
  lastCheckInAt: string | null;
  nextCheckInAt: string | null;
  nextCheckInNeed: NeedDTO | null;
}

// ============================================================================
// API Requests/Responses
// ============================================================================

// GET /api/v1/needs/reference
export interface GetNeedsReferenceResponse {
  needs: NeedDTO[];
}

// GET /api/v1/needs/state
export interface GetNeedsStateResponse {
  state: NeedsAssessmentStateDTO;
  currentScores: NeedWithScoreDTO[];
}

// POST /api/v1/needs/baseline
export interface SubmitBaselineRequest {
  scores: {
    needId: number;
    score: number;
    clarification?: string;
  }[];
}

export interface SubmitBaselineResponse {
  success: boolean;
  summary: NeedsSummaryDTO;
}

export interface NeedsSummaryDTO {
  totalNeeds: number;
  byCategory: {
    category: NeedsCategory;
    categoryName: string;
    totalNeeds: number;
    notMet: number; // score = 0
    somewhatMet: number; // score = 1
    fullyMet: number; // score = 2
  }[];
  overall: {
    notMet: number;
    somewhatMet: number;
    fullyMet: number;
  };
}

// POST /api/v1/needs/:needId/check-in
export interface CheckInNeedRequest {
  score: number;
  clarification?: string;
}

export interface CheckInNeedResponse {
  success: boolean;
  previousScore: number | null;
  newScore: number;
  trend: 'up' | 'down' | 'stable';
  needId: number;
  needName: string;
}

// GET /api/v1/needs/:needId/history
export interface GetNeedHistoryRequest {
  limit?: number;
}

export interface GetNeedHistoryResponse {
  needId: number;
  needName: string;
  history: NeedScoreDTO[];
}

// PATCH /api/v1/needs/preferences
export interface UpdateNeedsPreferencesRequest {
  checkInFrequencyDays?: number;
}

export interface UpdateNeedsPreferencesResponse {
  success: boolean;
  checkInFrequencyDays: number;
}

// ============================================================================
// Category Names Helper
// ============================================================================

export const NEEDS_CATEGORY_NAMES: Record<NeedsCategory, string> = {
  [NeedsCategory.FOUNDATION]: 'Foundation & Survival',
  [NeedsCategory.EMOTIONAL]: 'Emotional & Psychological',
  [NeedsCategory.RELATIONAL]: 'Relational',
  [NeedsCategory.INTEGRATION]: 'Integration & Meaning',
  [NeedsCategory.TRANSCENDENCE]: 'Transcendence',
};
