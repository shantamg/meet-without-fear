/**
 * Distillation Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for reviewing, editing, and deleting takeaways
 * extracted from Inner Thoughts sessions.
 *
 * All mutations use optimistic updates via setQueryData — never invalidateQueries
 * while mutations are in-flight (project state management rule).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch, del } from '../lib/api';
import type {
  TakeawayDTO,
  GetTakeawaysResponse,
  UpdateTakeawayResponse,
  DeleteTakeawayResponse,
} from '@meet-without-fear/shared';
import { takeawayKeys } from './queryKeys';

// ============================================================================
// useTakeaways — fetch all takeaways for a session
// ============================================================================

/**
 * Fetch takeaways for a distilled session.
 *
 * Returns the takeaway list and the session's distilledAt timestamp.
 * Only fetches when sessionId is non-empty.
 */
export function useTakeaways(sessionId: string) {
  return useQuery({
    queryKey: takeawayKeys.list(sessionId),
    queryFn: () =>
      get<GetTakeawaysResponse>(`/inner-thoughts/${sessionId}/takeaways`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

// ============================================================================
// useUpdateTakeaway — edit a takeaway's content (optimistic)
// ============================================================================

interface UpdateTakeawayVars {
  takeawayId: string;
  content: string;
}

interface TakeawayMutationContext {
  previous: GetTakeawaysResponse | undefined;
}

/**
 * Mutation to update the content of a takeaway.
 *
 * Optimistically updates the cache immediately so the UI stays responsive.
 * Rolls back on error using the saved previous snapshot.
 *
 * CRITICAL: Uses setQueryData only — never invalidateQueries (project rule).
 */
export function useUpdateTakeaway(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation<UpdateTakeawayResponse, Error, UpdateTakeawayVars, TakeawayMutationContext>({
    mutationFn: ({ takeawayId, content }) =>
      patch<UpdateTakeawayResponse>(`/inner-thoughts/${sessionId}/takeaways/${takeawayId}`, {
        content,
      }),

    onMutate: async ({ takeawayId, content }): Promise<TakeawayMutationContext> => {
      // Cancel any in-flight fetches for this list so they don't overwrite
      await queryClient.cancelQueries({ queryKey: takeawayKeys.list(sessionId) });

      // Snapshot previous data for rollback
      const previous = queryClient.getQueryData<GetTakeawaysResponse>(
        takeawayKeys.list(sessionId)
      );

      // Optimistically update the matching takeaway's content
      queryClient.setQueryData<GetTakeawaysResponse>(takeawayKeys.list(sessionId), (old) => {
        if (!old) return old;
        return {
          ...old,
          takeaways: old.takeaways.map((t: TakeawayDTO) =>
            t.id === takeawayId ? { ...t, content } : t
          ),
        };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Roll back to the previous state
      if (context?.previous) {
        queryClient.setQueryData(takeawayKeys.list(sessionId), context.previous);
      }
    },
  });
}

// ============================================================================
// useDeleteTakeaway — remove a takeaway (optimistic)
// ============================================================================

interface DeleteTakeawayVars {
  takeawayId: string;
}

/**
 * Mutation to delete a single takeaway.
 *
 * Optimistically removes the row from the cache immediately.
 * Rolls back on error using the saved previous snapshot.
 *
 * CRITICAL: Uses setQueryData only — never invalidateQueries (project rule).
 */
export function useDeleteTakeaway(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation<DeleteTakeawayResponse, Error, DeleteTakeawayVars, TakeawayMutationContext>({
    mutationFn: ({ takeawayId }) =>
      del<DeleteTakeawayResponse>(
        `/inner-thoughts/${sessionId}/takeaways/${takeawayId}`
      ),

    onMutate: async ({ takeawayId }): Promise<TakeawayMutationContext> => {
      // Cancel any in-flight fetches for this list
      await queryClient.cancelQueries({ queryKey: takeawayKeys.list(sessionId) });

      // Snapshot previous data for rollback
      const previous = queryClient.getQueryData<GetTakeawaysResponse>(
        takeawayKeys.list(sessionId)
      );

      // Optimistically remove the deleted takeaway from the list
      queryClient.setQueryData<GetTakeawaysResponse>(takeawayKeys.list(sessionId), (old) => {
        if (!old) return old;
        return {
          ...old,
          takeaways: old.takeaways.filter((t: TakeawayDTO) => t.id !== takeawayId),
        };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Roll back to the previous state
      if (context?.previous) {
        queryClient.setQueryData(takeawayKeys.list(sessionId), context.previous);
      }
    },
  });
}
