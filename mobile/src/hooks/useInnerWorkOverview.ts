/**
 * Inner Work Overview Hook for Meet Without Fear Mobile
 *
 * React Query hooks for the Inner Work hub/dashboard.
 * Aggregates data from all Inner Work features.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, ApiClientError } from '../lib/api';
import {
  InnerWorkOverviewDTO,
  GetInnerWorkOverviewResponse,
  GetCrossFeatureContextResponse,
  GetInsightsResponse,
  DismissInsightResponse,
  InsightType,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const innerWorkKeys = {
  all: ['innerWork'] as const,
  overview: () => [...innerWorkKeys.all, 'overview'] as const,
  context: () => [...innerWorkKeys.all, 'context'] as const,
  insights: () => [...innerWorkKeys.all, 'insights'] as const,
  insightsWithParams: (params: { type?: InsightType; includeDismissed?: boolean }) =>
    [...innerWorkKeys.insights(), params] as const,
};

// ============================================================================
// Overview Hook
// ============================================================================

/**
 * Fetch Inner Work overview data for the hub screen.
 * Aggregates stats from needs, gratitude, meditation, and people.
 */
export function useInnerWorkOverview(
  options?: Omit<
    UseQueryOptions<GetInnerWorkOverviewResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: innerWorkKeys.overview(),
    queryFn: async () => {
      return get<GetInnerWorkOverviewResponse>('/inner-work/overview');
    },
    staleTime: 60_000, // 1 minute
    ...options,
  });
}

// ============================================================================
// Cross-Feature Context Hook
// ============================================================================

/**
 * Fetch cross-feature context with optional pattern detection.
 */
export function useCrossFeatureContext(
  includePatterns = false,
  options?: Omit<
    UseQueryOptions<GetCrossFeatureContextResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [...innerWorkKeys.context(), { includePatterns }],
    queryFn: async () => {
      const url = includePatterns
        ? '/inner-work/context?includePatterns=true'
        : '/inner-work/context';
      return get<GetCrossFeatureContextResponse>(url);
    },
    staleTime: 5 * 60_000, // 5 minutes
    ...options,
  });
}

// ============================================================================
// Derived Data Helpers
// ============================================================================

/**
 * Check if user has completed initial onboarding for Inner Work.
 */
export function hasCompletedOnboarding(overview: InnerWorkOverviewDTO | undefined): boolean {
  if (!overview) return false;
  return overview.needsAssessment.baselineCompleted;
}

/**
 * Get suggested next action for Inner Work.
 */
export function getSuggestedAction(overview: InnerWorkOverviewDTO | undefined): {
  type: 'needs_baseline' | 'gratitude' | 'meditation' | 'needs_checkin' | 'explore';
  title: string;
  description: string;
} | null {
  if (!overview) return null;

  // If no baseline, suggest starting there
  if (!overview.needsAssessment.baselineCompleted) {
    return {
      type: 'needs_baseline',
      title: 'Start Your Journey',
      description: 'Take 5 minutes to check in with your 19 core human needs.',
    };
  }

  // If low needs and haven't checked in recently
  if (
    overview.needsAssessment.lowNeedsCount > 0 &&
    overview.needsAssessment.nextCheckInDue
  ) {
    const dueDate = new Date(overview.needsAssessment.nextCheckInDue);
    if (dueDate <= new Date()) {
      return {
        type: 'needs_checkin',
        title: 'Check In',
        description: `You have ${overview.needsAssessment.lowNeedsCount} needs that could use attention.`,
      };
    }
  }

  // If no gratitude today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (
    overview.gratitude.lastEntryDate &&
    new Date(overview.gratitude.lastEntryDate) < today
  ) {
    return {
      type: 'gratitude',
      title: 'See the Positive',
      description: "What's something you're grateful for today?",
    };
  }

  // If meditation streak is 0 or low
  if (overview.meditation.currentStreak === 0) {
    return {
      type: 'meditation',
      title: 'Find Stillness',
      description: 'Start or renew your meditation practice.',
    };
  }

  // Default: explore
  return {
    type: 'explore',
    title: 'Explore Inner Work',
    description: 'Continue your journey of self-discovery.',
  };
}

/**
 * Calculate overall "wellness score" from Inner Work data.
 * Returns a value from 0-100.
 */
export function calculateWellnessScore(overview: InnerWorkOverviewDTO | undefined): number | null {
  if (!overview || !overview.needsAssessment.baselineCompleted) {
    return null;
  }

  // Base score from needs (0-2 average scaled to 0-50)
  const needsScore = overview.needsAssessment.overallScore ?? 0;
  const needsContribution = (needsScore / 2) * 50;

  // Streak bonuses (up to 30 points)
  const gratitudeStreakBonus = Math.min(overview.gratitude.streakDays * 2, 15);
  const meditationStreakBonus = Math.min(overview.meditation.currentStreak * 2, 15);

  // Activity bonus (up to 20 points)
  const hasRecentGratitude = overview.gratitude.lastEntryDate
    ? daysSince(new Date(overview.gratitude.lastEntryDate)) < 2
    : false;
  const hasRecentMeditation = overview.meditation.lastSessionDate
    ? daysSince(new Date(overview.meditation.lastSessionDate)) < 2
    : false;

  const activityBonus = (hasRecentGratitude ? 10 : 0) + (hasRecentMeditation ? 10 : 0);

  return Math.min(
    100,
    Math.round(needsContribution + gratitudeStreakBonus + meditationStreakBonus + activityBonus)
  );
}

function daysSince(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Insights Hooks
// ============================================================================

interface UseInsightsParams {
  limit?: number;
  type?: InsightType;
  includeDismissed?: boolean;
}

/**
 * Fetch user insights with optional filtering.
 */
export function useInsights(
  params: UseInsightsParams = {},
  options?: Omit<
    UseQueryOptions<GetInsightsResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const { limit = 20, type, includeDismissed = false } = params;

  return useQuery({
    queryKey: innerWorkKeys.insightsWithParams({ type, includeDismissed }),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      queryParams.set('limit', String(limit));
      if (type) queryParams.set('type', type);
      if (includeDismissed) queryParams.set('includeDismissed', 'true');

      return get<GetInsightsResponse>(`/inner-work/insights?${queryParams.toString()}`);
    },
    staleTime: 60_000, // 1 minute
    ...options,
  });
}

/**
 * Dismiss an insight (hide from future lists).
 */
export function useDismissInsight(
  options?: Omit<
    UseMutationOptions<DismissInsightResponse, ApiClientError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      return post<DismissInsightResponse>(`/inner-work/insights/${insightId}/dismiss`, {});
    },
    onSuccess: () => {
      // Invalidate insights queries to refetch without the dismissed insight
      queryClient.invalidateQueries({ queryKey: innerWorkKeys.insights() });
      // Also invalidate overview which includes recent insights
      queryClient.invalidateQueries({ queryKey: innerWorkKeys.overview() });
    },
    ...options,
  });
}
