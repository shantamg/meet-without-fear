/**
 * Needs Assessment Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for the "Am I OK?" needs assessment feature.
 * Enables users to assess and track their 19 core human needs.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, patch, ApiClientError } from '../lib/api';
import {
  NeedDTO,
  NeedWithScoreDTO,
  NeedsAssessmentStateDTO,
  GetNeedsReferenceResponse,
  GetNeedsStateResponse,
  SubmitBaselineRequest,
  SubmitBaselineResponse,
  CheckInNeedRequest,
  CheckInNeedResponse,
  GetNeedHistoryResponse,
  UpdateNeedsPreferencesRequest,
  UpdateNeedsPreferencesResponse,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const needsKeys = {
  all: ['needs'] as const,
  reference: () => [...needsKeys.all, 'reference'] as const,
  state: () => [...needsKeys.all, 'state'] as const,
  history: (needId: number) => [...needsKeys.all, 'history', needId] as const,
};

// ============================================================================
// Reference Data Hook
// ============================================================================

/**
 * Fetch the 19 core human needs reference data.
 * This data rarely changes, so it has a long stale time.
 */
export function useNeedsReference(
  options?: Omit<
    UseQueryOptions<GetNeedsReferenceResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: needsKeys.reference(),
    queryFn: async () => {
      return get<GetNeedsReferenceResponse>('/needs/reference');
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - reference data is static
    ...options,
  });
}

// ============================================================================
// User State Hook
// ============================================================================

/**
 * Fetch user's current needs assessment state and scores.
 */
export function useNeedsState(
  options?: Omit<
    UseQueryOptions<GetNeedsStateResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: needsKeys.state(),
    queryFn: async () => {
      return get<GetNeedsStateResponse>('/needs/state');
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

// ============================================================================
// Baseline Assessment Hook
// ============================================================================

/**
 * Submit the initial baseline assessment for all 19 needs.
 */
export function useSubmitBaseline(
  options?: Omit<
    UseMutationOptions<SubmitBaselineResponse, ApiClientError, SubmitBaselineRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SubmitBaselineRequest) => {
      return post<SubmitBaselineResponse, SubmitBaselineRequest>('/needs/baseline', data);
    },
    onSuccess: () => {
      // Invalidate state to refetch with new baseline
      queryClient.invalidateQueries({ queryKey: needsKeys.state() });
    },
    ...options,
  });
}

// ============================================================================
// Check-In Hook
// ============================================================================

/**
 * Check in on a single need with a new score.
 */
export function useCheckInNeed(
  options?: Omit<
    UseMutationOptions<CheckInNeedResponse, ApiClientError, { needId: number; data: CheckInNeedRequest }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ needId, data }: { needId: number; data: CheckInNeedRequest }) => {
      return post<CheckInNeedResponse, CheckInNeedRequest>(`/needs/${needId}/check-in`, data);
    },
    onSuccess: (_data, variables) => {
      // Invalidate state and history for this need
      queryClient.invalidateQueries({ queryKey: needsKeys.state() });
      queryClient.invalidateQueries({ queryKey: needsKeys.history(variables.needId) });
    },
    ...options,
  });
}

// ============================================================================
// History Hook
// ============================================================================

/**
 * Fetch score history for a specific need.
 */
export function useNeedHistory(
  needId: number,
  options?: Omit<
    UseQueryOptions<GetNeedHistoryResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: needsKeys.history(needId),
    queryFn: async () => {
      return get<GetNeedHistoryResponse>(`/needs/${needId}/history`);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: needId > 0,
    ...options,
  });
}

// ============================================================================
// Preferences Hook
// ============================================================================

/**
 * Update needs assessment preferences.
 */
export function useUpdateNeedsPreferences(
  options?: Omit<
    UseMutationOptions<UpdateNeedsPreferencesResponse, ApiClientError, UpdateNeedsPreferencesRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateNeedsPreferencesRequest) => {
      return patch<UpdateNeedsPreferencesResponse, UpdateNeedsPreferencesRequest>('/needs/preferences', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: needsKeys.state() });
    },
    ...options,
  });
}

// ============================================================================
// Derived Data Helpers
// ============================================================================

/**
 * Get needs grouped by category.
 */
export function groupNeedsByCategory(needs: NeedWithScoreDTO[]): Record<string, NeedWithScoreDTO[]> {
  return needs.reduce((acc, need) => {
    const category = need.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(need);
    return acc;
  }, {} as Record<string, NeedWithScoreDTO[]>);
}

/**
 * Get low-scoring needs (score 0 or 1).
 */
export function getLowNeeds(needs: NeedWithScoreDTO[]): NeedWithScoreDTO[] {
  return needs.filter(n => n.currentScore !== null && n.currentScore <= 1);
}

/**
 * Get high-scoring needs (score 2).
 */
export function getHighNeeds(needs: NeedWithScoreDTO[]): NeedWithScoreDTO[] {
  return needs.filter(n => n.currentScore === 2);
}

/**
 * Calculate overall needs score (average).
 */
export function calculateOverallScore(needs: NeedWithScoreDTO[]): number | null {
  const scoredNeeds = needs.filter(n => n.currentScore !== null);
  if (scoredNeeds.length === 0) return null;

  const sum = scoredNeeds.reduce((acc, n) => acc + (n.currentScore ?? 0), 0);
  return sum / scoredNeeds.length;
}
