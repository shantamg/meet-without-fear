/**
 * Meditation Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for the "Develop Loving Awareness" meditation feature.
 * Enables users to practice guided and unguided meditation with AI-generated scripts.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, patch, del, ApiClientError } from '../lib/api';
import {
  MeditationSessionDTO,
  MeditationStatsDTO,
  MeditationFavoriteDTO,
  MeditationPreferencesDTO,
  MeditationType,
  CreateMeditationSessionRequest,
  CreateMeditationSessionResponse,
  UpdateMeditationSessionRequest,
  UpdateMeditationSessionResponse,
  ListMeditationSessionsResponse,
  GetMeditationSuggestionResponse,
  GenerateScriptRequest,
  GenerateScriptResponse,
  GetMeditationStatsResponse,
  ListMeditationFavoritesResponse,
  CreateMeditationFavoriteRequest,
  CreateMeditationFavoriteResponse,
  DeleteMeditationFavoriteResponse,
  GetMeditationPreferencesResponse,
  UpdateMeditationPreferencesRequest,
  UpdateMeditationPreferencesResponse,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const meditationKeys = {
  all: ['meditation'] as const,
  sessions: (params?: { limit?: number }) => [...meditationKeys.all, 'sessions', params] as const,
  stats: () => [...meditationKeys.all, 'stats'] as const,
  favorites: () => [...meditationKeys.all, 'favorites'] as const,
  preferences: () => [...meditationKeys.all, 'preferences'] as const,
  suggestion: () => [...meditationKeys.all, 'suggestion'] as const,
};

// ============================================================================
// Sessions Hooks
// ============================================================================

/**
 * Fetch meditation sessions history.
 */
export function useMeditationSessions(
  params?: { limit?: number },
  options?: Omit<
    UseQueryOptions<ListMeditationSessionsResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const limit = params?.limit ?? 20;

  return useQuery({
    queryKey: meditationKeys.sessions({ limit }),
    queryFn: async () => {
      return get<ListMeditationSessionsResponse>(`/meditation/sessions?limit=${limit}`);
    },
    staleTime: 60_000, // 1 minute
    ...options,
  });
}

/**
 * Create a new meditation session.
 */
export function useCreateMeditationSession(
  options?: Omit<
    UseMutationOptions<CreateMeditationSessionResponse, ApiClientError, CreateMeditationSessionRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMeditationSessionRequest) => {
      return post<CreateMeditationSessionResponse, CreateMeditationSessionRequest>('/meditation/sessions', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meditationKeys.sessions() });
    },
    ...options,
  });
}

/**
 * Update a meditation session (mark complete, add rating, etc.).
 */
export function useUpdateMeditationSession(
  options?: Omit<
    UseMutationOptions<UpdateMeditationSessionResponse, ApiClientError, { id: string; data: UpdateMeditationSessionRequest }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMeditationSessionRequest }) => {
      return patch<UpdateMeditationSessionResponse, UpdateMeditationSessionRequest>(`/meditation/sessions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meditationKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: meditationKeys.stats() });
    },
    ...options,
  });
}

// ============================================================================
// Stats Hook
// ============================================================================

/**
 * Fetch meditation statistics.
 */
export function useMeditationStats(
  options?: Omit<
    UseQueryOptions<GetMeditationStatsResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: meditationKeys.stats(),
    queryFn: async () => {
      return get<GetMeditationStatsResponse>('/meditation/stats');
    },
    staleTime: 60_000, // 1 minute
    ...options,
  });
}

// ============================================================================
// Suggestion Hook
// ============================================================================

/**
 * Get an AI-powered meditation suggestion.
 */
export function useMeditationSuggestion(
  options?: Omit<
    UseMutationOptions<GetMeditationSuggestionResponse, ApiClientError, void>,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async () => {
      return post<GetMeditationSuggestionResponse, Record<string, never>>('/meditation/suggest', {});
    },
    ...options,
  });
}

// ============================================================================
// Script Generation Hook
// ============================================================================

/**
 * Generate a meditation script.
 */
export function useGenerateMeditationScript(
  options?: Omit<
    UseMutationOptions<GenerateScriptResponse, ApiClientError, GenerateScriptRequest>,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async (data: GenerateScriptRequest) => {
      return post<GenerateScriptResponse, GenerateScriptRequest>('/meditation/generate-script', data);
    },
    ...options,
  });
}

// ============================================================================
// Favorites Hooks
// ============================================================================

/**
 * Fetch favorite meditations.
 */
export function useMeditationFavorites(
  options?: Omit<
    UseQueryOptions<ListMeditationFavoritesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: meditationKeys.favorites(),
    queryFn: async () => {
      return get<ListMeditationFavoritesResponse>('/meditation/favorites');
    },
    staleTime: 5 * 60_000, // 5 minutes
    ...options,
  });
}

/**
 * Create a meditation favorite.
 */
export function useCreateMeditationFavorite(
  options?: Omit<
    UseMutationOptions<CreateMeditationFavoriteResponse, ApiClientError, CreateMeditationFavoriteRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMeditationFavoriteRequest) => {
      return post<CreateMeditationFavoriteResponse, CreateMeditationFavoriteRequest>('/meditation/favorites', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meditationKeys.favorites() });
    },
    ...options,
  });
}

/**
 * Delete a meditation favorite.
 */
export function useDeleteMeditationFavorite(
  options?: Omit<
    UseMutationOptions<DeleteMeditationFavoriteResponse, ApiClientError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return del<DeleteMeditationFavoriteResponse>(`/meditation/favorites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meditationKeys.favorites() });
    },
    ...options,
  });
}

// ============================================================================
// Preferences Hooks
// ============================================================================

/**
 * Fetch meditation preferences.
 */
export function useMeditationPreferences(
  options?: Omit<
    UseQueryOptions<GetMeditationPreferencesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: meditationKeys.preferences(),
    queryFn: async () => {
      return get<GetMeditationPreferencesResponse>('/meditation/preferences');
    },
    staleTime: 5 * 60_000, // 5 minutes
    ...options,
  });
}

/**
 * Update meditation preferences.
 */
export function useUpdateMeditationPreferences(
  options?: Omit<
    UseMutationOptions<UpdateMeditationPreferencesResponse, ApiClientError, UpdateMeditationPreferencesRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateMeditationPreferencesRequest) => {
      return patch<UpdateMeditationPreferencesResponse, UpdateMeditationPreferencesRequest>('/meditation/preferences', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meditationKeys.preferences() });
    },
    ...options,
  });
}

// ============================================================================
// Derived Data Helpers
// ============================================================================

/**
 * Get duration options for meditation sessions.
 */
export function getDurationOptions(): { value: number; label: string }[] {
  return [
    { value: 5, label: '5 min' },
    { value: 10, label: '10 min' },
    { value: 15, label: '15 min' },
    { value: 20, label: '20 min' },
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '60 min' },
  ];
}

/**
 * Get common focus areas for meditation.
 */
export function getFocusAreaSuggestions(): string[] {
  return [
    'Breath awareness',
    'Body scan',
    'Loving-kindness',
    'Self-compassion',
    'Gratitude',
    'Letting go',
    'Present moment',
    'Stress relief',
    'Sleep preparation',
    'Emotional regulation',
    'Relationship healing',
    'Inner peace',
  ];
}

/**
 * Format meditation duration for display.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format total meditation time for stats.
 */
export function formatTotalTime(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes} minutes`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}
