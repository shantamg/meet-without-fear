/**
 * Stage Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for stage-specific API operations.
 * Covers all 5 stages: Onboarding, Witness, Perspective Stretch, Need Mapping, Strategic Repair.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  InfiniteData,
} from '@tanstack/react-query';
import { get, post, ApiClientError } from '../lib/api';
import { messageKeys } from './useMessages';
import {
  // Response types
  SignCompactResponse,
  CompactStatusResponse,
  ConfirmFeelHeardResponse,
  SaveEmpathyDraftResponse,
  ConsentToShareEmpathyResponse,
  GetProgressResponse,
  GateSatisfactionDTO,
  StageBlockedReason,
  // DTOs
  GetEmpathyDraftResponse,
  GetPartnerEmpathyResponse,
  ValidateEmpathyRequest,
  ValidateEmpathyResponse,
  GetNeedsResponse,
  ConfirmNeedsRequest,
  ConfirmNeedsResponse,
  GetCommonGroundResponse,
  ConfirmCommonGroundRequest,
  ConfirmCommonGroundResponse,
  AddNeedRequest,
  AddNeedResponse,
  ConsentShareNeedsResponse,
  StrategyDTO,
  GetStrategiesResponse,
  ProposeStrategyRequest,
  ProposeStrategyResponse,
  SubmitRankingResponse,
  RevealOverlapResponse,
  MarkReadyResponse,
  AgreementDTO,
  CreateAgreementRequest,
  CreateAgreementResponse,
  ConfirmAgreementResponse,
  ResolveSessionResponse,
  Stage,
  StageStatus,
  GetMessagesResponse,
  MessageRole,
} from '@meet-without-fear/shared';
import { sessionKeys } from './useSessions';

// ============================================================================
// Query Keys
// ============================================================================

export const stageKeys = {
  all: ['stages'] as const,
  progress: (sessionId: string) => [...stageKeys.all, 'progress', sessionId] as const,

  // Stage 0: Compact
  compact: (sessionId: string) => [...stageKeys.all, 'compact', sessionId] as const,

  // Gate status
  gates: (sessionId: string, stage: number) =>
    [...stageKeys.all, 'gates', sessionId, stage] as const,

  // Stage 2: Empathy
  empathyDraft: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'draft', sessionId] as const,
  partnerEmpathy: (sessionId: string) =>
    [...stageKeys.all, 'empathy', 'partner', sessionId] as const,

  // Stage 3: Needs
  needs: (sessionId: string) => [...stageKeys.all, 'needs', sessionId] as const,
  commonGround: (sessionId: string) =>
    [...stageKeys.all, 'commonGround', sessionId] as const,

  // Stage 4: Strategies
  strategies: (sessionId: string) =>
    [...stageKeys.all, 'strategies', sessionId] as const,
  strategiesReveal: (sessionId: string) =>
    [...stageKeys.all, 'strategies', 'reveal', sessionId] as const,
  agreements: (sessionId: string) =>
    [...stageKeys.all, 'agreements', sessionId] as const,
};

// ============================================================================
// Progress Hook
// ============================================================================

/**
 * Get session progress for both users.
 */
export function useProgress(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetProgressResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.progress(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetProgressResponse>(`/sessions/${sessionId}/progress`);
    },
    enabled: !!sessionId,
    staleTime: 10_000, // Progress can change frequently
    ...options,
  });
}

// ============================================================================
// Stage 0: Curiosity Compact
// ============================================================================

/**
 * Get compact status for both users.
 */
export function useCompactStatus(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<CompactStatusResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.compact(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<CompactStatusResponse>(`/sessions/${sessionId}/compact/status`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Sign the curiosity compact.
 */
export function useSignCompact(
  options?: Omit<
    UseMutationOptions<
      SignCompactResponse,
      ApiClientError,
      { sessionId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      // Optimistically update the compact status BEFORE the request
      // This hides the overlay immediately so users can't double-click
      queryClient.setQueryData(
        sessionKeys.state(sessionId),
        (old: unknown) => {
          if (!old || typeof old !== 'object') return old;
          const state = old as Record<string, unknown>;
          return {
            ...state,
            compact: {
              ...(state.compact as Record<string, unknown>),
              mySigned: true,
              mySignedAt: new Date().toISOString(),
            },
          };
        }
      );

      return post<SignCompactResponse>(`/sessions/${sessionId}/compact/sign`, {
        agreed: true,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.compact(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      // Also invalidate consolidated state so shouldShowCompactOverlay updates
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
    },
    onError: (_, { sessionId }) => {
      // On error, invalidate to refetch the true state
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage 1: Feel Heard
// ============================================================================

/**
 * Confirm that user feels heard (gate for stage 1 completion).
 */
export function useConfirmFeelHeard(
  options?: Omit<
    UseMutationOptions<
      ConfirmFeelHeardResponse,
      ApiClientError,
      { sessionId: string; confirmed: boolean; feedback?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, confirmed, feedback }) => {
      return post<ConfirmFeelHeardResponse>(`/sessions/${sessionId}/feel-heard`, {
        confirmed,
        feedback,
      });
    },
    onSuccess: (data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      // Invalidate session state to update milestones (feelHeardConfirmedAt)
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
      // Invalidate messages to fetch the transition message if one was generated
      // Include both 'list' and 'infinite' query types to ensure React Query refetches
      if (data.transitionMessage) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key[0] === 'messages' &&
              (key[1] === 'list' || key[1] === 'infinite') &&
              key[2] === sessionId
            );
          },
        });
      }
    },
    ...options,
  });
}

// ============================================================================
// Stage 2: Empathy / Perspective Stretch
// ============================================================================

/**
 * Get current empathy draft.
 */
export function useEmpathyDraft(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetEmpathyDraftResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.empathyDraft(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetEmpathyDraftResponse>(`/sessions/${sessionId}/empathy/draft`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Save empathy draft.
 */
export function useSaveEmpathyDraft(
  options?: Omit<
    UseMutationOptions<
      SaveEmpathyDraftResponse,
      ApiClientError,
      { sessionId: string; content: string; readyToShare?: boolean }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, content, readyToShare }) => {
      return post<SaveEmpathyDraftResponse>(
        `/sessions/${sessionId}/empathy/draft`,
        { content, readyToShare }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
    },
    ...options,
  });
}

/**
 * Consent to share empathy attempt.
 * Pass draftContent for optimistic UI update (shows empathy message immediately).
 */
export function useConsentToShareEmpathy(
  options?: Omit<
    UseMutationOptions<
      ConsentToShareEmpathyResponse,
      ApiClientError,
      { sessionId: string; consent: boolean; draftContent?: string },
      { previousList: GetMessagesResponse | undefined; previousInfinite: InfiniteData<GetMessagesResponse> | undefined }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, consent }) => {
      console.log('[useConsentToShareEmpathy] mutationFn called', { sessionId, consent });
      try {
        const result = await post<ConsentToShareEmpathyResponse>(
          `/sessions/${sessionId}/empathy/consent`,
          { consent }
        );
        console.log('[useConsentToShareEmpathy] mutationFn success', result);
        return result;
      } catch (error) {
        console.error('[useConsentToShareEmpathy] mutationFn error', error);
        throw error;
      }
    },
    onMutate: async ({ sessionId, draftContent }): Promise<{ previousList: GetMessagesResponse | undefined; previousInfinite: InfiniteData<GetMessagesResponse> | undefined }> => {
      console.log('[useConsentToShareEmpathy] onMutate started');
      
      // Safety Check: Verify messageKeys exists (circular dependency protection)
      if (!messageKeys || !messageKeys.list || !messageKeys.infinite) {
        console.error('[useConsentToShareEmpathy] CRITICAL: messageKeys is undefined due to circular dependency');
        // Return empty context so mutation continues despite optimistic error
        return { previousList: undefined, previousInfinite: undefined };
      }

      try {
        // Cancel any outgoing refetches to avoid overwriting optimistic update
        await queryClient.cancelQueries({ queryKey: messageKeys.infinite(sessionId) });

        // Snapshot previous state for rollback
        const previousInfinite = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(messageKeys.infinite(sessionId));

        // Only add optimistic message if we have draft content
        if (draftContent) {
          const optimisticMessage = {
            id: `optimistic-empathy-${Date.now()}`,
            sessionId,
            senderId: null,
            role: MessageRole.EMPATHY_STATEMENT,
            content: draftContent,
            stage: 2,
            timestamp: new Date().toISOString(),
          };

          // Update infinite query cache with proper immutability
          // For inverted lists (newest first), add to the START of the first page
          queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
            messageKeys.infinite(sessionId),
            (old: InfiniteData<GetMessagesResponse> | undefined) => {
              if (!old || !old.pages || old.pages.length === 0) {
                return {
                  pages: [{ messages: [optimisticMessage], hasMore: false }],
                  pageParams: [undefined],
                };
              }

              // Deep clone to ensure immutability
              const newPages = [...old.pages];
              const firstPage = { ...newPages[0] };
              
              // Add to the START of the messages array (newest first in inverted list)
              // This ensures it appears at the bottom visually (since list is inverted)
              firstPage.messages = [optimisticMessage, ...firstPage.messages];
              
              newPages[0] = firstPage;
              return { ...old, pages: newPages };
            }
          );

          // Also update the stage-specific infinite query if it exists
          queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
            messageKeys.infinite(sessionId, 2),
            (old: InfiniteData<GetMessagesResponse> | undefined) => {
              if (!old || !old.pages || old.pages.length === 0) {
                return {
                  pages: [{ messages: [optimisticMessage], hasMore: false }],
                  pageParams: [undefined],
                };
              }

              const newPages = [...old.pages];
              const firstPage = { ...newPages[0] };
              firstPage.messages = [optimisticMessage, ...firstPage.messages];
              newPages[0] = firstPage;
              return { ...old, pages: newPages };
            }
          );

          console.log('[useConsentToShareEmpathy] Optimistic update applied to infinite query');
        }

        // Immediately hide the empathy draft preview card
        queryClient.setQueryData<GetEmpathyDraftResponse>(
          stageKeys.empathyDraft(sessionId),
          (old) => {
            if (!old) return { draft: null, canConsent: false, alreadyConsented: true };
            return { ...old, canConsent: false, alreadyConsented: true };
          }
        );

        return { previousList: undefined, previousInfinite };
      } catch (err) {
        console.error('[useConsentToShareEmpathy] Error in onMutate:', err);
        // Return empty context so mutation continues despite optimistic error
        // This ensures the network request still fires even if optimistic update fails
        return { previousList: undefined, previousInfinite: undefined };
      }
    },
    onSuccess: (data, { sessionId, draftContent }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });

      // Replace optimistic message with real ones and add AI response
      const messagesToAdd: Array<{
        id: string;
        sessionId: string;
        senderId: string | null;
        role: MessageRole;
        content: string;
        stage: number;
        timestamp: string;
      }> = [];
      if (data.empathyMessage) {
        messagesToAdd.push({
          id: data.empathyMessage.id,
          sessionId,
          senderId: null,
          role: MessageRole.EMPATHY_STATEMENT,
          content: data.empathyMessage.content,
          stage: data.empathyMessage.stage,
          timestamp: data.empathyMessage.timestamp,
        });
      }
      if (data.transitionMessage) {
        messagesToAdd.push({
          id: data.transitionMessage.id,
          sessionId,
          senderId: null,
          role: MessageRole.AI,
          content: data.transitionMessage.content,
          stage: data.transitionMessage.stage,
          timestamp: data.transitionMessage.timestamp,
        });
      }

      if (messagesToAdd.length > 0) {
        // Update caches, removing optimistic message and adding real ones
        const updateCache = (old: GetMessagesResponse | undefined): GetMessagesResponse => {
          if (!old) return { messages: messagesToAdd, hasMore: false };
          // Remove optimistic message, add real messages
          const filteredMessages = old.messages.filter((m) => !m.id.startsWith('optimistic-empathy-'));
          const existingIds = new Set(filteredMessages.map((m) => m.id));
          const newMessages = messagesToAdd.filter((m) => !existingIds.has(m.id));
          return { ...old, messages: [...filteredMessages, ...newMessages] };
        };

        const updateInfiniteCache = (
          old: InfiniteData<GetMessagesResponse> | undefined
        ): InfiniteData<GetMessagesResponse> | undefined => {
          if (!old || !old.pages || old.pages.length === 0) {
            return { pages: [{ messages: messagesToAdd, hasMore: false }], pageParams: [undefined] };
          }
          // Deep clone to ensure immutability
          const newPages = [...old.pages];
          const firstPage = { ...newPages[0] };
          
          // Remove optimistic message, add real messages
          // For inverted lists (newest first), add to the START of the array
          const filteredMessages = firstPage.messages.filter((m) => !m.id.startsWith('optimistic-empathy-'));
          const existingIds = new Set(filteredMessages.map((m) => m.id));
          const newMessages = messagesToAdd.filter((m) => !existingIds.has(m.id));
          
          // Add new messages to the start (newest first)
          firstPage.messages = [...newMessages, ...filteredMessages];
          newPages[0] = firstPage;
          
          return { ...old, pages: newPages };
        };

        queryClient.setQueryData<GetMessagesResponse>(messageKeys.list(sessionId), updateCache);
        queryClient.setQueryData<GetMessagesResponse>(messageKeys.list(sessionId, 2), updateCache);
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(messageKeys.infinite(sessionId), updateInfiniteCache);
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(messageKeys.infinite(sessionId, 2), updateInfiniteCache);
      }

      // Invalidate consolidated session state for UI updates
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
      // Invalidate ALL messages queries for this session
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === 'messages' &&
            (key[1] === 'list' || key[1] === 'infinite') &&
            key[2] === sessionId
          );
        },
      });
    },
    onError: (_err, { sessionId }, context) => {
      // Rollback to previous state on error
      if (context?.previousInfinite) {
        queryClient.setQueryData(messageKeys.infinite(sessionId), context.previousInfinite);
      }
      // Restore draft preview card
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
    },
    onSettled: (_data, _error, { sessionId }) => {
      // Refetch to ensure server timestamp/ID are correct
      queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
    },
    ...options,
  });
}

/**
 * Get partner's empathy attempt (after both consented).
 */
export function usePartnerEmpathy(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetPartnerEmpathyResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.partnerEmpathy(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetPartnerEmpathyResponse>(`/sessions/${sessionId}/empathy/partner`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Validate partner's empathy attempt.
 */
export function useValidateEmpathy(
  options?: Omit<
    UseMutationOptions<ValidateEmpathyResponse, ApiClientError, ValidateEmpathyRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: ValidateEmpathyRequest) => {
      return post<ValidateEmpathyResponse>(
        `/sessions/${request.sessionId}/empathy/validate`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage 3: Need Mapping
// ============================================================================

/**
 * Get AI-identified needs for the current user.
 */
export function useNeeds(
  sessionId: string | undefined,
  options?: Omit<UseQueryOptions<GetNeedsResponse, ApiClientError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: stageKeys.needs(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetNeedsResponse>(`/sessions/${sessionId}/needs`);
    },
    enabled: !!sessionId,
    staleTime: 60_000, // Needs analysis doesn't change frequently
    ...options,
  });
}

/**
 * Confirm or adjust identified needs.
 */
export function useConfirmNeeds(
  options?: Omit<
    UseMutationOptions<
      ConfirmNeedsResponse,
      ApiClientError,
      { sessionId: string; confirmations: ConfirmNeedsRequest['confirmations'] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, confirmations }) => {
      return post<ConfirmNeedsResponse>(`/sessions/${sessionId}/needs/confirm`, {
        confirmations,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Add a custom need.
 */
export function useAddNeed(
  options?: Omit<
    UseMutationOptions<
      AddNeedResponse,
      ApiClientError,
      { sessionId: string } & AddNeedRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, need, category, description }) => {
      return post<AddNeedResponse>(`/sessions/${sessionId}/needs`, {
        need,
        category,
        description,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
    },
    ...options,
  });
}

/**
 * Consent to share needs for common ground discovery.
 */
export function useConsentShareNeeds(
  options?: Omit<
    UseMutationOptions<
      ConsentShareNeedsResponse,
      ApiClientError,
      { sessionId: string; needIds: string[] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, needIds }) => {
      return post<ConsentShareNeedsResponse>(`/sessions/${sessionId}/needs/consent`, {
        needIds,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.needs(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.commonGround(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Get common ground (shared needs between both users).
 */
export function useCommonGround(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetCommonGroundResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.commonGround(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetCommonGroundResponse>(`/sessions/${sessionId}/common-ground`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Confirm common ground items.
 */
export function useConfirmCommonGround(
  options?: Omit<
    UseMutationOptions<
      ConfirmCommonGroundResponse,
      ApiClientError,
      { sessionId: string; confirmations: ConfirmCommonGroundRequest['confirmations'] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, confirmations }) => {
      return post<ConfirmCommonGroundResponse>(
        `/sessions/${sessionId}/common-ground/confirm`,
        { confirmations }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.commonGround(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage 4: Strategic Repair
// ============================================================================

/**
 * Get strategies for the session.
 */
export function useStrategies(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetStrategiesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.strategies(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetStrategiesResponse>(`/sessions/${sessionId}/strategies`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Propose a new strategy.
 */
export function useProposeStrategy(
  options?: Omit<
    UseMutationOptions<
      ProposeStrategyResponse,
      ApiClientError,
      { sessionId: string } & ProposeStrategyRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      description,
      needsAddressed,
      duration,
      measureOfSuccess,
    }) => {
      return post<ProposeStrategyResponse>(`/sessions/${sessionId}/strategies`, {
        description,
        needsAddressed,
        duration,
        measureOfSuccess,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
    },
    ...options,
  });
}

/**
 * Request AI strategy suggestions.
 */
export function useRequestStrategySuggestions(
  options?: Omit<
    UseMutationOptions<
      { suggestions: StrategyDTO[]; source: 'AI_GENERATED' },
      ApiClientError,
      { sessionId: string; count?: number; focusNeeds?: string[] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, count, focusNeeds }) => {
      return post<{ suggestions: StrategyDTO[]; source: 'AI_GENERATED' }>(
        `/sessions/${sessionId}/strategies/suggestions`,
        { count, focusNeeds }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
    },
    ...options,
  });
}

/**
 * Mark ready to rank strategies.
 */
export function useMarkReadyToRank(
  options?: Omit<
    UseMutationOptions<MarkReadyResponse, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<MarkReadyResponse>(`/sessions/${sessionId}/strategies/ready`);
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Submit strategy rankings.
 */
export function useSubmitRankings(
  options?: Omit<
    UseMutationOptions<
      SubmitRankingResponse,
      ApiClientError,
      { sessionId: string; rankedIds: string[] }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, rankedIds }) => {
      return post<SubmitRankingResponse>(`/sessions/${sessionId}/strategies/rank`, {
        rankedIds,
      });
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.strategies(sessionId) });
      queryClient.invalidateQueries({
        queryKey: stageKeys.strategiesReveal(sessionId),
      });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

/**
 * Get strategy reveal (overlap after both ranked).
 */
export function useStrategiesReveal(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<RevealOverlapResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.strategiesReveal(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<RevealOverlapResponse>(`/sessions/${sessionId}/strategies/overlap`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Agreements
// ============================================================================

/**
 * Get agreements for the session.
 */
export function useAgreements(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<{ agreements: AgreementDTO[] }, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.agreements(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<{ agreements: AgreementDTO[] }>(`/sessions/${sessionId}/agreements`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Create an agreement.
 */
export function useCreateAgreement(
  options?: Omit<
    UseMutationOptions<
      CreateAgreementResponse,
      ApiClientError,
      { sessionId: string } & CreateAgreementRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, ...request }) => {
      return post<CreateAgreementResponse>(
        `/sessions/${sessionId}/agreements`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.agreements(sessionId) });
    },
    ...options,
  });
}

/**
 * Confirm an agreement.
 */
export function useConfirmAgreement(
  options?: Omit<
    UseMutationOptions<
      ConfirmAgreementResponse,
      ApiClientError,
      { sessionId: string; agreementId: string; confirmed: boolean; modification?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, agreementId, confirmed, modification }) => {
      return post<ConfirmAgreementResponse>(
        `/sessions/${sessionId}/agreements/${agreementId}/confirm`,
        { confirmed, modification }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.agreements(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

/**
 * Resolve the session (complete Stage 4).
 */
export function useResolveSession(
  options?: Omit<
    UseMutationOptions<ResolveSessionResponse, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<ResolveSessionResponse>(`/sessions/${sessionId}/resolve`);
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Stage Advancement
// ============================================================================

/**
 * Response type for advance stage API.
 * Based on backend controller implementation.
 */
interface AdvanceStageApiResponse {
  advanced: boolean;
  newStage: number;
  newStatus: StageStatus | 'NOT_STARTED';
  advancedAt: string | null;
  blockedReason?: StageBlockedReason;
  unsatisfiedGates?: string[];
}

/**
 * Advance to the next stage.
 * POST /sessions/:id/stages/advance
 */
export function useAdvanceStage(
  options?: Omit<
    UseMutationOptions<AdvanceStageApiResponse, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<AdvanceStageApiResponse>(`/sessions/${sessionId}/stages/advance`);
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Gate Status
// ============================================================================

/**
 * Response type for gate status API.
 */
interface GateStatusResponse {
  stage: Stage;
  gates: GateSatisfactionDTO;
}

/**
 * Get gate satisfaction status for a specific stage.
 * GET /sessions/:id/stages/:stage/gates
 */
export function useGateStatus(
  sessionId: string | undefined,
  stage: number | undefined,
  options?: Omit<
    UseQueryOptions<GateStatusResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.gates(sessionId || '', stage ?? 0),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      if (stage === undefined) throw new Error('Stage is required');
      return get<GateStatusResponse>(`/sessions/${sessionId}/stages/${stage}/gates`);
    },
    enabled: !!sessionId && stage !== undefined,
    staleTime: 15_000, // Gates can change frequently during a stage
    ...options,
  });
}
