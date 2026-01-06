/**
 * Memory Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for "Things to Always Remember" feature.
 * Enables users to manage persistent memories that the AI honors across conversations.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, put, del, ApiClientError } from '../lib/api';
import {
  UserMemoryDTO,
  CreateMemoryRequest,
  UpdateMemoryRequest,
  ApproveMemoryRequest,
  RejectMemoryRequest,
  ListMemoriesResponse,
  FormatMemoryRequest,
  FormatMemoryResponse,
  UpdateMemoryAIResponse,
  ConfirmMemoryRequest,
  ConfirmMemoryUpdateRequest,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const memoryKeys = {
  all: ['memories'] as const,
  list: () => [...memoryKeys.all, 'list'] as const,
  detail: (id: string) => [...memoryKeys.all, 'detail', id] as const,
};

// ============================================================================
// List Memories Hook
// ============================================================================

/**
 * Fetch all user memories organized by scope (global and session).
 */
export function useMemories(
  options?: Omit<
    UseQueryOptions<ListMemoriesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: memoryKeys.list(),
    queryFn: async () => {
      return get<ListMemoriesResponse>('/memories');
    },
    staleTime: 60_000, // 1 minute - memories don't change frequently
    ...options,
  });
}

// ============================================================================
// Create Memory Hook
// ============================================================================

/**
 * Create a new user memory.
 */
export function useCreateMemory(
  options?: Omit<
    UseMutationOptions<UserMemoryDTO, ApiClientError, CreateMemoryRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMemoryRequest) => {
      return post<UserMemoryDTO, CreateMemoryRequest>('/memories', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.list() });
    },
    ...options,
  });
}

// ============================================================================
// Update Memory Hook
// ============================================================================

/**
 * Update an existing memory.
 */
export function useUpdateMemory(
  options?: Omit<
    UseMutationOptions<
      UserMemoryDTO,
      ApiClientError,
      { id: string; data: UpdateMemoryRequest }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMemoryRequest }) => {
      return put<UserMemoryDTO, UpdateMemoryRequest>(`/memories/${id}`, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.list() });
      queryClient.invalidateQueries({ queryKey: memoryKeys.detail(id) });
    },
    ...options,
  });
}

// ============================================================================
// Delete Memory Hook
// ============================================================================

/**
 * Delete a memory.
 */
export function useDeleteMemory(
  options?: Omit<
    UseMutationOptions<void, ApiClientError, string>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await del<{ deleted: boolean }>(`/memories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.list() });
    },
    ...options,
  });
}

// ============================================================================
// Approve Memory Suggestion Hook
// ============================================================================

/**
 * Approve an AI-suggested memory.
 * Creates a new active memory from the suggestion.
 */
export function useApproveMemory(
  options?: Omit<
    UseMutationOptions<UserMemoryDTO, ApiClientError, ApproveMemoryRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ApproveMemoryRequest) => {
      return post<UserMemoryDTO, ApproveMemoryRequest>('/memories/approve', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.list() });
    },
    ...options,
  });
}

// ============================================================================
// Reject Memory Suggestion Hook
// ============================================================================

/**
 * Reject an AI-suggested memory.
 * Records the rejection to avoid suggesting similar memories in the future.
 */
export function useRejectMemory(
  options?: Omit<
    UseMutationOptions<void, ApiClientError, RejectMemoryRequest>,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async (data: RejectMemoryRequest) => {
      await post<{ rejected: boolean }, RejectMemoryRequest>('/memories/reject', data);
    },
    ...options,
  });
}

// ============================================================================
// AI-Assisted Memory Creation
// ============================================================================

/**
 * Format a natural language input into a memory using AI.
 * Returns a suggested memory for user approval.
 */
export function useFormatMemory(
  options?: Omit<
    UseMutationOptions<FormatMemoryResponse, ApiClientError, FormatMemoryRequest>,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async (data: FormatMemoryRequest) => {
      return post<FormatMemoryResponse, FormatMemoryRequest>('/memories/format', data);
    },
    ...options,
  });
}

/**
 * Confirm and save an AI-formatted memory.
 */
export function useConfirmMemory(
  options?: Omit<
    UseMutationOptions<UserMemoryDTO, ApiClientError, ConfirmMemoryRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ConfirmMemoryRequest) => {
      return post<UserMemoryDTO, ConfirmMemoryRequest>('/memories/confirm', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.list() });
    },
    ...options,
  });
}

// ============================================================================
// AI-Assisted Memory Update
// ============================================================================

/**
 * Request an AI-assisted update to an existing memory.
 * Returns the suggested update for user approval.
 */
export function useUpdateMemoryAI(
  options?: Omit<
    UseMutationOptions<
      UpdateMemoryAIResponse,
      ApiClientError,
      { memoryId: string; changeRequest: string }
    >,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async ({ memoryId, changeRequest }) => {
      return post<UpdateMemoryAIResponse, { changeRequest: string }>(
        `/memories/${memoryId}/update`,
        { changeRequest }
      );
    },
    ...options,
  });
}

/**
 * Confirm and save an AI-updated memory.
 */
export function useConfirmMemoryUpdate(
  options?: Omit<
    UseMutationOptions<UserMemoryDTO, ApiClientError, ConfirmMemoryUpdateRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ConfirmMemoryUpdateRequest) => {
      return post<UserMemoryDTO, ConfirmMemoryUpdateRequest>(
        `/memories/${data.memoryId}/confirm-update`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.list() });
    },
    ...options,
  });
}
