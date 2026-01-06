/**
 * Gratitude Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for the "See the Positive" gratitude practice feature.
 * Enables users to journal gratitude and track patterns over time.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  UseQueryOptions,
  UseMutationOptions,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { get, post, patch, del, ApiClientError } from '../lib/api';
import {
  GratitudeEntryDTO,
  GratitudePreferencesDTO,
  GratitudePatternsDTO,
  CreateGratitudeRequest,
  CreateGratitudeResponse,
  ListGratitudeResponse,
  GetGratitudeResponse,
  DeleteGratitudeResponse,
  GetGratitudePatternsResponse,
  GetGratitudePreferencesResponse,
  UpdateGratitudePreferencesRequest,
  UpdateGratitudePreferencesResponse,
  GetGratitudePromptResponse,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const gratitudeKeys = {
  all: ['gratitude'] as const,
  list: (params?: { limit?: number; offset?: number }) => [...gratitudeKeys.all, 'list', params] as const,
  detail: (id: string) => [...gratitudeKeys.all, 'detail', id] as const,
  patterns: () => [...gratitudeKeys.all, 'patterns'] as const,
  preferences: () => [...gratitudeKeys.all, 'preferences'] as const,
  prompt: () => [...gratitudeKeys.all, 'prompt'] as const,
};

// ============================================================================
// List Entries Hook
// ============================================================================

/**
 * Fetch gratitude entries with pagination.
 */
export function useGratitudeEntries(
  params?: { limit?: number },
  options?: Omit<
    UseQueryOptions<ListGratitudeResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const limit = params?.limit ?? 20;

  return useQuery({
    queryKey: gratitudeKeys.list({ limit }),
    queryFn: async () => {
      return get<ListGratitudeResponse>(`/gratitude?limit=${limit}`);
    },
    staleTime: 60_000, // 1 minute
    ...options,
  });
}

/**
 * Fetch gratitude entries with infinite scroll.
 */
export function useInfiniteGratitudeEntries(
  options?: Omit<
    UseInfiniteQueryOptions<ListGratitudeResponse, ApiClientError>,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >
) {
  return useInfiniteQuery({
    queryKey: [...gratitudeKeys.all, 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      return get<ListGratitudeResponse>(`/gratitude?limit=20&offset=${pageParam}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.entries.length, 0);
      return totalFetched < lastPage.total ? totalFetched : undefined;
    },
    initialPageParam: 0,
    ...options,
  });
}

// ============================================================================
// Single Entry Hook
// ============================================================================

/**
 * Fetch a single gratitude entry by ID.
 */
export function useGratitudeEntry(
  id: string,
  options?: Omit<
    UseQueryOptions<GetGratitudeResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gratitudeKeys.detail(id),
    queryFn: async () => {
      return get<GetGratitudeResponse>(`/gratitude/${id}`);
    },
    enabled: !!id,
    ...options,
  });
}

// ============================================================================
// Create Entry Hook
// ============================================================================

/**
 * Create a new gratitude entry.
 */
export function useCreateGratitude(
  options?: Omit<
    UseMutationOptions<CreateGratitudeResponse, ApiClientError, CreateGratitudeRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateGratitudeRequest) => {
      return post<CreateGratitudeResponse, CreateGratitudeRequest>('/gratitude', data);
    },
    onSuccess: () => {
      // Invalidate list and patterns
      queryClient.invalidateQueries({ queryKey: gratitudeKeys.all });
    },
    ...options,
  });
}

// ============================================================================
// Delete Entry Hook
// ============================================================================

/**
 * Delete a gratitude entry.
 */
export function useDeleteGratitude(
  options?: Omit<
    UseMutationOptions<DeleteGratitudeResponse, ApiClientError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return del<DeleteGratitudeResponse>(`/gratitude/${id}`);
    },
    onSuccess: () => {
      // Invalidate list and patterns
      queryClient.invalidateQueries({ queryKey: gratitudeKeys.all });
    },
    ...options,
  });
}

// ============================================================================
// Patterns Hook
// ============================================================================

/**
 * Fetch aggregated gratitude patterns.
 */
export function useGratitudePatterns(
  options?: Omit<
    UseQueryOptions<GetGratitudePatternsResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gratitudeKeys.patterns(),
    queryFn: async () => {
      return get<GetGratitudePatternsResponse>('/gratitude/patterns');
    },
    staleTime: 5 * 60_000, // 5 minutes
    ...options,
  });
}

// ============================================================================
// Preferences Hooks
// ============================================================================

/**
 * Fetch gratitude preferences.
 */
export function useGratitudePreferences(
  options?: Omit<
    UseQueryOptions<GetGratitudePreferencesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gratitudeKeys.preferences(),
    queryFn: async () => {
      return get<GetGratitudePreferencesResponse>('/gratitude/preferences');
    },
    staleTime: 5 * 60_000, // 5 minutes
    ...options,
  });
}

/**
 * Update gratitude preferences.
 */
export function useUpdateGratitudePreferences(
  options?: Omit<
    UseMutationOptions<UpdateGratitudePreferencesResponse, ApiClientError, UpdateGratitudePreferencesRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateGratitudePreferencesRequest) => {
      return patch<UpdateGratitudePreferencesResponse, UpdateGratitudePreferencesRequest>('/gratitude/preferences', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gratitudeKeys.preferences() });
    },
    ...options,
  });
}

// ============================================================================
// Prompt Hook
// ============================================================================

/**
 * Fetch a contextual gratitude prompt.
 */
export function useGratitudePrompt(
  options?: Omit<
    UseQueryOptions<GetGratitudePromptResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: gratitudeKeys.prompt(),
    queryFn: async () => {
      return get<GetGratitudePromptResponse>('/gratitude/prompt');
    },
    staleTime: 60_000, // 1 minute - prompts should feel fresh
    ...options,
  });
}

// ============================================================================
// Derived Data Helpers
// ============================================================================

/**
 * Calculate current gratitude streak.
 */
export function calculateStreak(entries: GratitudeEntryDTO[]): number {
  if (entries.length === 0) return 0;

  const sorted = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  for (const entry of sorted) {
    const entryDate = new Date(entry.createdAt);
    entryDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0 || diffDays === 1) {
      streak++;
      currentDate = entryDate;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Get entries from today.
 */
export function getTodaysEntries(entries: GratitudeEntryDTO[]): GratitudeEntryDTO[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return entries.filter(entry => {
    const entryDate = new Date(entry.createdAt);
    entryDate.setHours(0, 0, 0, 0);
    return entryDate.getTime() === today.getTime();
  });
}
