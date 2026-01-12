/**
 * Cross-Feature Intelligence DTOs
 *
 * Data Transfer Objects for pattern recognition and insights across Inner Work features.
 */

import { InsightType } from '../enums';

// ============================================================================
// Cross-Feature Context
// ============================================================================

export interface CrossFeatureContextDTO {
  // Needs data
  needsScores: { needId: number; name: string; score: number; lastUpdated: string }[];
  lowNeeds: string[]; // Names of needs scored 0-1
  highNeeds: string[]; // Names of needs scored 2

  // Gratitude data
  recentGratitudeThemes: string[];
  gratitudeFrequencyByPerson: { name: string; count: number }[];
  gratitudeSentimentTrend: 'positive' | 'negative' | 'stable';

  // Meditation data
  meditationStreak: number;
  recentMeditationFocuses: string[];
  meditationFrequencyTrend: 'increasing' | 'decreasing' | 'stable';

  // Conflict data
  activeConflicts: { partnerName: string; stage: number; topic?: string }[];
  recentConflictThemes: string[];

  // People data
  frequentlyMentioned: { name: string; contexts: string[] }[];
  rarelyMentionedInGratitude: string[]; // Partners with low gratitude mentions
}

// ============================================================================
// Pattern Types
// ============================================================================

export interface ContradictionDTO {
  type: 'needs_vs_behavior' | 'stated_vs_observed';
  needId?: number;
  needName?: string;
  description: string;
  evidence: string[];
  confidence: number; // 0-1
}

export interface CorrelationDTO {
  type: 'meditation_conflict' | 'gratitude_needs' | 'theme_pattern';
  description: string;
  dataPoints: { x: string; y: string }[];
  strength: number; // 0-1
}

export interface GapDTO {
  type: 'missing_gratitude' | 'missing_checkin' | 'missing_meditation';
  description: string;
  suggestion: string;
}

// ============================================================================
// Insights
// ============================================================================

export interface InsightDTO {
  id: string;
  type: InsightType;
  summary: string;
  data: InsightDataDTO;
  priority: number; // 0-10
  dismissed: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface InsightDataDTO {
  title?: string;
  description?: string;
  confidence?: number; // 0-1
  evidence?: string[];
  suggestedAction?: string;
  relatedFeatures?: string[];
}

export interface WeeklyInsightSummaryDTO {
  weekOf: string;
  summary: string;
  highlights: string[];
  areasOfGrowth: string[];
  suggestions: string[];
  overallTrend: 'improving' | 'declining' | 'stable' | 'mixed';
}

// ============================================================================
// API Requests/Responses
// ============================================================================

// GET /api/v1/inner-work/context
export interface GetCrossFeatureContextResponse {
  context: CrossFeatureContextDTO;
  patterns: {
    contradictions: ContradictionDTO[];
    correlations: CorrelationDTO[];
    gaps: GapDTO[];
  };
}

// GET /api/v1/inner-work/insights
export interface GetInsightsRequest {
  limit?: number;
  type?: InsightType;
  includeDismissed?: boolean;
}

export interface GetInsightsResponse {
  insights: InsightDTO[];
  hasMore: boolean;
}

// POST /api/v1/inner-work/insights/:id/dismiss
export interface DismissInsightResponse {
  success: boolean;
}

// GET /api/v1/inner-work/weekly-summary
export interface GetWeeklySummaryResponse {
  summary: WeeklyInsightSummaryDTO;
}

// ============================================================================
// Inner Work Hub Overview
// ============================================================================

export interface InnerWorkOverviewDTO {
  needsAssessment: {
    baselineCompleted: boolean;
    overallScore: number | null; // Average of all needs
    lowNeedsCount: number;
    nextCheckInDue: string | null;
  };
  gratitude: {
    totalEntries: number;
    streakDays: number;
    lastEntryDate: string | null;
  };
  meditation: {
    totalSessions: number;
    currentStreak: number;
    totalMinutes: number;
    lastSessionDate: string | null;
  };
  people: {
    totalTracked: number;
    recentlyMentioned: string[];
  };
  recentInsights: InsightDTO[];
}

// GET /api/v1/inner-work/overview
export interface GetInnerWorkOverviewResponse {
  overview: InnerWorkOverviewDTO;
}
