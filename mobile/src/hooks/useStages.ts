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
import { useAuth } from './useAuth';
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
  SessionStateResponse,
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
  EmpathyExchangeStatusResponse,
  GetShareSuggestionResponse,
  RespondToShareSuggestionRequest,
  RespondToShareSuggestionResponse,
  ResubmitEmpathyResponse,
  SkipRefinementRequest,
  SkipRefinementResponse,
  SaveValidationFeedbackDraftRequest,
  SaveValidationFeedbackDraftResponse,
  RefineValidationFeedbackRequest,
  RefineValidationFeedbackResponse,
} from '@meet-without-fear/shared';

// Import query keys from centralized file to avoid circular dependencies
import {
  sessionKeys,
  stageKeys,
  messageKeys,
} from './queryKeys';

// Re-export for backwards compatibility
export { stageKeys };

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
 * Get empathy exchange status (for Stage 2 progress and reconciler status)
 */
export function useEmpathyStatus(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<EmpathyExchangeStatusResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.empathyStatus(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<EmpathyExchangeStatusResponse>(`/sessions/${sessionId}/empathy/status`);
    },
    enabled: !!sessionId,
    staleTime: 5_000,
    ...options,
  });
}

/**
 * Get pending share offer (from reconciler)
 */
export function useShareOffer(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetShareSuggestionResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: stageKeys.shareOffer(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetShareSuggestionResponse>(`/sessions/${sessionId}/reconciler/share-offer`);
    },
    enabled: !!sessionId,
    staleTime: 0, // Always check for fresh offer
    ...options,
  });
}

/**
 * Respond to a share offer
 */
export function useRespondToShareOffer(
  options?: Omit<
    UseMutationOptions<
      RespondToShareSuggestionResponse,
      ApiClientError,
      { sessionId: string; sharedContent?: string } & RespondToShareSuggestionRequest,
      { previousInfinite: InfiniteData<GetMessagesResponse> | undefined }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();
  const { user: shareOfferUser } = useAuth();

  return useMutation<
    RespondToShareSuggestionResponse,
    ApiClientError,
    { sessionId: string; sharedContent?: string } & RespondToShareSuggestionRequest,
    { previousInfinite: InfiniteData<GetMessagesResponse> | undefined }
  >({
    mutationFn: async ({ sessionId, sharedContent: _, ...request }) => {
      return post<RespondToShareSuggestionResponse>(
        `/sessions/${sessionId}/reconciler/share-offer/respond`,
        request
      );
    },
    onMutate: async ({ sessionId, action, sharedContent }) => {
      // Only add optimistic message for 'accept' action with content
      if (action !== 'accept' || !sharedContent) {
        return { previousInfinite: undefined };
      }

      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: messageKeys.infinite(sessionId) });

      // Snapshot previous state for rollback
      const previousInfinite = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId)
      );

      // Create optimistic "What you shared" message
      const optimisticMessage = {
        id: `optimistic-shared-${Date.now()}`,
        sessionId,
        senderId: shareOfferUser?.id ?? null,
        role: MessageRole.EMPATHY_STATEMENT,
        content: sharedContent,
        stage: 2,
        timestamp: new Date().toISOString(),
      };

      // Update infinite query cache - add to END (chronological order within page)
      // useUnifiedSession flattens with [...pages].reverse().flatMap()
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        (old) => {
          if (!old || !old.pages || old.pages.length === 0) {
            return {
              pages: [{ messages: [optimisticMessage], hasMore: false }],
              pageParams: [undefined],
            };
          }

          const newPages = [...old.pages];
          const firstPage = { ...newPages[0] };
          // Add to END for chronological order
          firstPage.messages = [...firstPage.messages, optimisticMessage];
          newPages[0] = firstPage;
          return { ...old, pages: newPages };
        }
      );

      // Immediately hide the share offer panel by clearing the cache
      queryClient.setQueryData<GetShareSuggestionResponse>(
        stageKeys.shareOffer(sessionId),
        { hasSuggestion: false, suggestion: null }
      );

      console.log('[useRespondToShareOffer] Optimistic update applied');
      return { previousInfinite };
    },
    onError: (err, { sessionId }, context) => {
      // Rollback on error
      if (context?.previousInfinite) {
        queryClient.setQueryData(messageKeys.infinite(sessionId), context.previousInfinite);
      }
      // Restore share offer data by invalidating
      queryClient.invalidateQueries({ queryKey: stageKeys.shareOffer(sessionId) });
      console.error('[useRespondToShareOffer] Error, rolling back:', err);
    },
    onSuccess: (data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: [...stageKeys.all, 'empathy', 'status', sessionId] });
      queryClient.invalidateQueries({ queryKey: stageKeys.shareOffer(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });

      // Replace optimistic message with real one (if provided) to avoid flash
      if (data.sharedMessage) {
        const realMessage = {
          id: data.sharedMessage.id,
          sessionId,
          senderId: shareOfferUser?.id ?? null,
          role: MessageRole.EMPATHY_STATEMENT,
          content: data.sharedMessage.content,
          stage: data.sharedMessage.stage,
          timestamp: data.sharedMessage.timestamp,
        };

        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId),
          (old) => {
            if (!old || !old.pages || old.pages.length === 0) {
              return {
                pages: [{ messages: [realMessage], hasMore: false }],
                pageParams: [undefined],
              };
            }

            // Replace optimistic message with real one
            const newPages = old.pages.map((page, pageIndex) => {
              if (pageIndex === 0) {
                const filteredMessages = page.messages.filter(
                  (m) => !m.id.startsWith('optimistic-shared-')
                );
                // Check if real message already exists
                const exists = filteredMessages.some((m) => m.id === realMessage.id);
                if (!exists) {
                  return { ...page, messages: [realMessage, ...filteredMessages] };
                }
                return { ...page, messages: filteredMessages };
              }
              return page;
            });
            return { ...old, pages: newPages };
          }
        );
        console.log('[useRespondToShareOffer] Replaced optimistic message with real one');
      } else {
        // Fallback: invalidate if no message returned
        queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
      }
    },
    ...options,
  });
}

/**
 * Response from the generate-draft endpoint
 */
export interface GenerateShareDraftResponse {
  draft: string;
  messageId: string;
  guesserName: string;
  suggestedShareFocus: string;
}

/**
 * Generate a share draft based on suggestedShareFocus.
 * Called when user taps "Yes, help me share" in the ShareTopicDrawer.
 * The draft is generated by AI and saved as a message in the chat.
 */
export function useGenerateShareDraft(
  options?: Omit<
    UseMutationOptions<
      GenerateShareDraftResponse,
      ApiClientError,
      { sessionId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    GenerateShareDraftResponse,
    ApiClientError,
    { sessionId: string }
  >({
    mutationFn: async ({ sessionId }) => {
      return post<GenerateShareDraftResponse>(
        `/sessions/${sessionId}/reconciler/share-offer/generate-draft`,
        {}
      );
    },
    onSuccess: (data, { sessionId }) => {
      // Invalidate messages to show the new AI message with the draft
      queryClient.invalidateQueries({ queryKey: messageKeys.infinite(sessionId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.list(sessionId) });
      console.log('[useGenerateShareDraft] Draft generated:', data.draft.substring(0, 50) + '...');
    },
    onError: (err) => {
      console.error('[useGenerateShareDraft] Error generating draft:', err);
    },
    ...options,
  });
}

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
/**
 * Context stored by onMutate for rollback on error.
 */
interface SignCompactContext {
  previousSessionState: SessionStateResponse | undefined;
  optimisticTimestamp: string;
}

/**
 * Sign the Curiosity Compact.
 *
 * Cache-First Architecture:
 * - onMutate: Immediately updates compact.mySigned and compact.mySignedAt in cache
 * - onSuccess: Invalidates queries to sync with server
 * - onError: Rolls back to previous cache state
 */
export function useSignCompact(
  options?: Omit<
    UseMutationOptions<
      SignCompactResponse,
      ApiClientError,
      { sessionId: string },
      SignCompactContext
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    SignCompactResponse,
    ApiClientError,
    { sessionId: string },
    SignCompactContext
  >({
    mutationFn: async ({ sessionId }) => {
      return post<SignCompactResponse>(`/sessions/${sessionId}/compact/sign`, {
        agreed: true,
      });
    },

    // =========================================================================
    // OPTIMISTIC UPDATE: Update compact status immediately
    // =========================================================================
    onMutate: async ({ sessionId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: sessionKeys.state(sessionId) });

      // Snapshot previous state for rollback
      const previousSessionState = queryClient.getQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId)
      );

      const optimisticTimestamp = new Date().toISOString();

      // Optimistically update compact status
      queryClient.setQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            compact: old.compact ? {
              ...old.compact,
              mySigned: true,
              mySignedAt: optimisticTimestamp,
            } : old.compact,
          };
        }
      );

      return { previousSessionState, optimisticTimestamp };
    },

    // =========================================================================
    // SUCCESS: Invalidate queries to sync with server
    // =========================================================================
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.compact(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      // Also invalidate consolidated state so shouldShowCompactOverlay updates
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
    },

    // =========================================================================
    // ERROR: Rollback to previous cache state
    // =========================================================================
    onError: (_error, { sessionId }, context) => {
      if (context?.previousSessionState !== undefined) {
        queryClient.setQueryData(sessionKeys.state(sessionId), context.previousSessionState);
      }
    },

    ...options,
  });
}

// ============================================================================
// Stage 1: Feel Heard
// ============================================================================

/**
 * Context stored by onMutate for rollback on error.
 */
interface ConfirmFeelHeardContext {
  previousSessionState: SessionStateResponse | undefined;
  optimisticTimestamp: string;
}

/**
 * Confirm that user feels heard (gate for stage 1 completion).
 *
 * Cache-First Architecture:
 * - onMutate: Immediately updates milestones.feelHeardConfirmedAt in cache
 * - onSuccess: Invalidates queries to sync with server
 * - onError: Rolls back to previous cache state
 */
export function useConfirmFeelHeard(
  options?: Omit<
    UseMutationOptions<
      ConfirmFeelHeardResponse,
      ApiClientError,
      { sessionId: string; confirmed: boolean; feedback?: string },
      ConfirmFeelHeardContext
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    ConfirmFeelHeardResponse,
    ApiClientError,
    { sessionId: string; confirmed: boolean; feedback?: string },
    ConfirmFeelHeardContext
  >({
    mutationFn: async ({ sessionId, confirmed, feedback }) => {
      return post<ConfirmFeelHeardResponse>(`/sessions/${sessionId}/feel-heard`, {
        confirmed,
        feedback,
      });
    },

    // =========================================================================
    // OPTIMISTIC UPDATE: Update milestones immediately
    // =========================================================================
    onMutate: async ({ sessionId, confirmed }) => {
      // Only optimistically update if confirming (not dismissing)
      if (!confirmed) {
        return { previousSessionState: undefined, optimisticTimestamp: '' };
      }

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: sessionKeys.state(sessionId) });

      // Snapshot previous state for rollback
      const previousSessionState = queryClient.getQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId)
      );

      const optimisticTimestamp = new Date().toISOString();

      // Optimistically update session state with feelHeardConfirmedAt AND advance stage
      queryClient.setQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            progress: old.progress ? {
              ...old.progress,
              myProgress: old.progress.myProgress ? {
                ...old.progress.myProgress,
                stage: Stage.PERSPECTIVE_STRETCH,
              } : old.progress.myProgress,
              milestones: {
                ...old.progress.milestones,
                feelHeardConfirmedAt: optimisticTimestamp,
              },
            } : old.progress,
          };
        }
      );

      return { previousSessionState, optimisticTimestamp };
    },

    // =========================================================================
    // SUCCESS: Update caches directly (no refetch needed!)
    // =========================================================================
    onSuccess: (data, { sessionId }, context) => {
      // Invalidate less critical queries in background
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });

      // UPDATE SESSION STATE DIRECTLY - DO NOT INVALIDATE!
      // Invalidating sessionKeys.state causes a race condition where the refetch
      // overwrites the optimistic update with stale server data before the server
      // has processed the mutation. This is the root cause of the recurring bug
      // where messages don't appear after feel-heard confirmation.
      // See commits: 6c6504e, d16a32f, 1151ab9 for history of this bug.
      queryClient.setQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId),
        (old) => {
          // If cache was cleared between onMutate and onSuccess, use context fallback
          const baseState = old ?? context?.previousSessionState;
          if (!baseState) return old;

          return {
            ...baseState,
            progress: baseState.progress ? {
              ...baseState.progress,
              myProgress: baseState.progress.myProgress ? {
                ...baseState.progress.myProgress,
                stage: Stage.PERSPECTIVE_STRETCH,
              } : baseState.progress.myProgress,
              milestones: {
                ...baseState.progress.milestones,
                // Use server's confirmedAt timestamp (authoritative)
                feelHeardConfirmedAt: data.confirmedAt || context?.optimisticTimestamp,
              },
            } : baseState.progress,
          };
        }
      );

      // Add transition message directly to cache instead of refetching
      // This preserves existing messages and prevents re-animation
      if (data.transitionMessage) {
        const newMessage = {
          id: data.transitionMessage.id,
          content: data.transitionMessage.content,
          timestamp: data.transitionMessage.timestamp,
          stage: data.transitionMessage.stage,
          role: MessageRole.AI,
          sessionId,
          senderId: null, // AI messages have no sender
        };

        const updateCache = (old: GetMessagesResponse | undefined): GetMessagesResponse => {
          if (!old) {
            return { messages: [newMessage], hasMore: false };
          }
          // Check for duplicates
          const existingIds = new Set((old.messages || []).map((m) => m.id));
          if (existingIds.has(newMessage.id)) {
            return old;
          }
          return {
            ...old,
            messages: [...(old.messages || []), newMessage],
          };
        };

        const updateInfiniteCache = (
          old: InfiniteData<GetMessagesResponse> | undefined
        ): InfiniteData<GetMessagesResponse> => {
          if (!old || old.pages.length === 0) {
            return {
              pages: [{ messages: [newMessage], hasMore: false }],
              pageParams: [undefined],
            };
          }
          // Update the first page (newest messages)
          const updatedPages = [...old.pages];
          const firstPage = updatedPages[0];
          const existingIds = new Set((firstPage.messages || []).map((m) => m.id));
          if (existingIds.has(newMessage.id)) {
            return old;
          }
          updatedPages[0] = {
            ...firstPage,
            messages: [...(firstPage.messages || []), newMessage],
          };
          return { ...old, pages: updatedPages };
        };

        // Update all message caches
        queryClient.setQueryData<GetMessagesResponse>(messageKeys.list(sessionId), updateCache);
        queryClient.setQueryData<GetMessagesResponse>(messageKeys.list(sessionId, 2), updateCache);
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(messageKeys.infinite(sessionId), updateInfiniteCache);
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(messageKeys.infinite(sessionId, 2), updateInfiniteCache);

        console.log(`[useConfirmFeelHeard] Added transition message ${newMessage.id} directly to cache`);
      }
    },

    // =========================================================================
    // ERROR: Rollback to previous cache state
    // =========================================================================
    onError: (_error, { sessionId }, context) => {
      if (context?.previousSessionState !== undefined) {
        queryClient.setQueryData(sessionKeys.state(sessionId), context.previousSessionState);
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
/** Context for consent mutation rollback */
interface ConsentToShareContext {
  previousInfinite: InfiniteData<GetMessagesResponse> | undefined;
  previousEmpathyStatus: EmpathyExchangeStatusResponse | undefined;
  previousEmpathyDraft: GetEmpathyDraftResponse | undefined;
}

export function useConsentToShareEmpathy(
  options?: Omit<
    UseMutationOptions<
      ConsentToShareEmpathyResponse,
      ApiClientError,
      { sessionId: string; consent: boolean; draftContent?: string },
      ConsentToShareContext
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Extract callbacks from options to merge with internal handlers
  // This prevents ...options from overwriting our onSuccess/onError
  const {
    onSuccess: externalOnSuccess,
    onError: externalOnError,
    ...restOptions
  } = options ?? {};

  return useMutation<
    ConsentToShareEmpathyResponse,
    ApiClientError,
    { sessionId: string; consent: boolean; draftContent?: string },
    ConsentToShareContext
  >({
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
    onMutate: async ({ sessionId, draftContent }): Promise<ConsentToShareContext> => {
      console.log('[useConsentToShareEmpathy] onMutate started');

      // Safety Check: Verify messageKeys exists (circular dependency protection)
      if (!messageKeys || !messageKeys.list || !messageKeys.infinite) {
        console.error('[useConsentToShareEmpathy] CRITICAL: messageKeys is undefined due to circular dependency');
        // Return empty context so mutation continues despite optimistic error
        return { previousInfinite: undefined, previousEmpathyStatus: undefined, previousEmpathyDraft: undefined };
      }

      try {
        // Cancel any outgoing refetches to avoid overwriting optimistic update
        await queryClient.cancelQueries({ queryKey: messageKeys.infinite(sessionId) });

        // Snapshot previous state for rollback
        const previousInfinite = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(messageKeys.infinite(sessionId));
        const previousEmpathyStatus = queryClient.getQueryData<EmpathyExchangeStatusResponse>(stageKeys.empathyStatus(sessionId));
        const previousEmpathyDraft = queryClient.getQueryData<GetEmpathyDraftResponse>(stageKeys.empathyDraft(sessionId));

        // Only add optimistic message if we have draft content
        if (draftContent) {
          const optimisticMessage = {
            id: `optimistic-empathy-${Date.now()}`,
            sessionId,
            senderId: user?.id ?? null,
            role: MessageRole.EMPATHY_STATEMENT,
            content: draftContent,
            stage: 2,
            timestamp: new Date().toISOString(),
            // Show "Sending..." while waiting for server confirmation
            sharedContentDeliveryStatus: 'sending' as const,
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

              // Add to the END of the messages array (chronological order within page)
              // useUnifiedSession flattens with [...pages].reverse().flatMap() which expects
              // each page's messages in chronological order (oldest to newest)
              firstPage.messages = [...firstPage.messages, optimisticMessage];

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
              // Add to END for chronological order within page
              firstPage.messages = [...firstPage.messages, optimisticMessage];
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

        // Optimistically set empathy status to mark that user has shared
        // Only set analyzing: true if partner has already shared their attempt
        // The actual status will be determined by the backend response and refetch
        queryClient.setQueryData<EmpathyExchangeStatusResponse>(
          stageKeys.empathyStatus(sessionId),
          (old) => ({
            // Preserve existing myAttempt or set to null (will be updated by refetch)
            myAttempt: old?.myAttempt ? {
              ...old.myAttempt,
              status: old?.partnerAttempt ? 'ANALYZING' : 'HELD',
            } : null,
            partnerAttempt: old?.partnerAttempt ?? null,
            partnerCompletedStage1: old?.partnerCompletedStage1 ?? false,
            // Only set analyzing: true if partner has already shared their attempt
            analyzing: !!old?.partnerAttempt,
            awaitingSharing: false,
            hasNewSharedContext: false,
            hasUnviewedSharedContext: false,
            sharedContext: old?.sharedContext ?? null,
            mySharedContext: old?.mySharedContext ?? null,
            refinementHint: old?.refinementHint ?? null,
            readyForStage3: false,
            messageCountSinceSharedContext: old?.messageCountSinceSharedContext ?? 0,
            sharedContentDeliveryStatus: 'sending', // Show sending status on message
            myReconcilerResult: old?.myReconcilerResult ?? null, // Preserve existing reconciler result
            partnerHasSubmittedEmpathy: old?.partnerHasSubmittedEmpathy ?? false,
            partnerEmpathyHeldStatus: old?.partnerEmpathyHeldStatus ?? null,
            partnerEmpathySubmittedAt: old?.partnerEmpathySubmittedAt ?? null,
          })
        );

        console.log('[useConsentToShareEmpathy] Optimistic updates applied to empathyDraft and empathyStatus');

        return { previousInfinite, previousEmpathyStatus, previousEmpathyDraft };
      } catch (err) {
        console.error('[useConsentToShareEmpathy] Error in onMutate:', err);
        // Return empty context so mutation continues despite optimistic error
        // This ensures the network request still fires even if optimistic update fails
        return { previousInfinite: undefined, previousEmpathyStatus: undefined, previousEmpathyDraft: undefined };
      }
    },
    onSuccess: (data, variables, context) => {
      const { sessionId } = variables;

      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.partnerEmpathy(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });

      // Directly update empathy status cache with correct delivery status
      // This immediately clears 'sending' status instead of waiting for refetch
      queryClient.setQueryData<EmpathyExchangeStatusResponse>(
        stageKeys.empathyStatus(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            sharedContentDeliveryStatus: 'pending', // Clear 'sending' status
            myAttempt: old.myAttempt ? {
              ...old.myAttempt,
              deliveryStatus: 'pending', // Update delivery status
              status: data.status === 'HELD' ? 'HELD' : old.myAttempt.status,
            } : old.myAttempt,
          };
        }
      );
      // Also invalidate to eventually sync with server
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });

      // Replace optimistic message with real ones and add AI response
      const messagesToAdd: Array<{
        id: string;
        sessionId: string;
        senderId: string | null;
        role: MessageRole;
        content: string;
        stage: number;
        timestamp: string;
        sharedContentDeliveryStatus?: 'pending';
        skipTypewriter?: boolean;
      }> = [];
      if (data.empathyMessage) {
        messagesToAdd.push({
          id: data.empathyMessage.id,
          sessionId,
          senderId: user?.id ?? null,
          role: MessageRole.EMPATHY_STATEMENT,
          content: data.empathyMessage.content,
          stage: data.empathyMessage.stage,
          timestamp: data.empathyMessage.timestamp,
          // Include pending delivery status until empathyStatusData refetch completes
          sharedContentDeliveryStatus: 'pending',
          // Skip animation since this replaces the optimistic message (prevents flicker)
          skipTypewriter: true,
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
          // Handle missing or malformed cache
          if (!old || !old.messages) {
            return { messages: messagesToAdd, hasMore: false };
          }
          // Remove optimistic message, add real messages
          const filteredMessages = old.messages.filter((m) => !m.id.startsWith('optimistic-empathy-'));
          const existingIds = new Set(filteredMessages.map((m) => m.id));
          const newMessages = messagesToAdd.filter((m) => !existingIds.has(m.id));
          return { ...old, messages: [...filteredMessages, ...newMessages] };
        };

        const updateInfiniteCache = (
          old: InfiniteData<GetMessagesResponse> | undefined
        ): InfiniteData<GetMessagesResponse> => {
          if (!old || !old.pages || old.pages.length === 0) {
            return { pages: [{ messages: messagesToAdd, hasMore: false }], pageParams: [undefined] };
          }
          // Deep clone to ensure immutability
          const newPages = [...old.pages];
          const firstPage = { ...newPages[0] };

          // Handle case where firstPage.messages might be undefined
          const existingMessages = firstPage.messages ?? [];

          // Remove optimistic message, add real messages
          // Add to END for chronological order within page (oldest to newest)
          // useUnifiedSession flattens with [...pages].reverse().flatMap()
          const filteredMessages = existingMessages.filter((m) => !m.id.startsWith('optimistic-empathy-'));
          const existingIds = new Set(filteredMessages.map((m) => m.id));
          const newMessages = messagesToAdd.filter((m) => !existingIds.has(m.id));

          // Add new messages to the END (chronological order within page)
          firstPage.messages = [...filteredMessages, ...newMessages];
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
      // Note: We don't invalidate message queries here because:
      // 1. We already added the real messages to the cache above
      // 2. A refetch would overwrite skipTypewriter flag, causing re-animation flicker
      // If we need to sync with server, a separate polling mechanism can be used

      // Call consumer's onSuccess callback if provided (type cast to work around React Query types)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (externalOnSuccess as any)?.(data, variables, context);
    },
    onError: (err, variables, context) => {
      const { sessionId } = variables;
      // Rollback to previous state on error
      if (context?.previousInfinite) {
        queryClient.setQueryData(messageKeys.infinite(sessionId), context.previousInfinite);
      }
      if (context?.previousEmpathyStatus) {
        queryClient.setQueryData(stageKeys.empathyStatus(sessionId), context.previousEmpathyStatus);
      }
      if (context?.previousEmpathyDraft) {
        queryClient.setQueryData(stageKeys.empathyDraft(sessionId), context.previousEmpathyDraft);
      }
      // Also invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });

      // Call consumer's onError callback if provided (type cast to work around React Query types)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (externalOnError as any)?.(err, variables, context);
    },
    // Note: Removed onSettled message refetch to prevent overwriting skipTypewriter flag
    // The real messages are added in onSuccess with correct IDs from the server response
    // Use restOptions (without onSuccess/onError) to prevent overwriting our handlers
    ...restOptions,
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

/**
 * Resubmit empathy statement after refining.
 * Used when user has received shared context from partner and is revising their understanding.
 */
export function useResubmitEmpathy(
  options?: Omit<
    UseMutationOptions<
      ResubmitEmpathyResponse,
      ApiClientError,
      { sessionId: string; content: string },
      { previousInfinite: InfiniteData<GetMessagesResponse> | undefined }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();

  return useMutation<
    ResubmitEmpathyResponse,
    ApiClientError,
    { sessionId: string; content: string },
    { previousInfinite: InfiniteData<GetMessagesResponse> | undefined }
  >({
    mutationFn: async ({ sessionId, content }) => {
      return post<ResubmitEmpathyResponse>(
        `/sessions/${sessionId}/empathy/resubmit`,
        { content }
      );
    },
    onMutate: async ({ sessionId, content }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: messageKeys.infinite(sessionId) });

      // Snapshot the previous value
      const previousInfinite = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId)
      );

      // Optimistically add the new message
      if (previousInfinite) {
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId),
          (old) => {
            if (!old) return old;

            const optimisticMessage: {
              id: string;
              sessionId: string;
              senderId: string | null;
              role: MessageRole;
              content: string;
              stage: number;
              timestamp: string;
              sharedContentDeliveryStatus: 'sending';
            } = {
              id: `optimistic-resubmit-${Date.now()}`,
              sessionId,
              senderId: authUser?.id ?? null,
              role: MessageRole.EMPATHY_STATEMENT,
              content,
              stage: 2,
              timestamp: new Date().toISOString(),
              // Show "Sending..." while waiting for server confirmation
              sharedContentDeliveryStatus: 'sending',
            };

            // Add to the last page
            const newPages = [...old.pages];
            const lastPageIndex = newPages.length - 1;
            if (lastPageIndex >= 0) {
              newPages[lastPageIndex] = {
                ...newPages[lastPageIndex],
                messages: [...newPages[lastPageIndex].messages, optimisticMessage],
              };
            }

            return { ...old, pages: newPages };
          }
        );
      }

      return { previousInfinite };
    },
    onSuccess: (data, { sessionId }) => {
      // Build the server message with proper typing
      const serverMessage: {
        id: string;
        sessionId: string;
        senderId: string | null;
        role: MessageRole;
        content: string;
        stage: number;
        timestamp: string;
        sharedContentDeliveryStatus: 'pending';
        skipTypewriter: boolean;
      } = {
        id: data.empathyMessage.id,
        sessionId,
        senderId: authUser?.id ?? null,
        role: MessageRole.EMPATHY_STATEMENT,
        content: data.empathyMessage.content,
        stage: data.empathyMessage.stage,
        timestamp: data.empathyMessage.timestamp,
        // Include pending delivery status until empathyStatusData refetch completes
        sharedContentDeliveryStatus: 'pending',
        // Skip animation since this replaces the optimistic message (prevents flicker)
        skipTypewriter: true,
      };

      // Update the message with the server response and add transition message if present
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        (old) => {
          if (!old) return old;

          // Replace optimistic message with server message
          let newPages = old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((msg) =>
              msg.id.startsWith('optimistic-resubmit-') ? serverMessage : msg
            ),
          }));

          // Add transition message if present
          if (data.transitionMessage) {
            const transitionMsg = {
              id: data.transitionMessage.id,
              sessionId,
              senderId: null,
              role: MessageRole.AI,
              content: data.transitionMessage.content,
              stage: data.transitionMessage.stage,
              timestamp: data.transitionMessage.timestamp,
            };

            // Add to the first page (most recent messages)
            if (newPages.length > 0) {
              const existingIds = new Set(newPages[0].messages.map((m) => m.id));
              if (!existingIds.has(transitionMsg.id)) {
                newPages = [
                  {
                    ...newPages[0],
                    messages: [...newPages[0].messages, transitionMsg],
                  },
                  ...newPages.slice(1),
                ];
              }
            }
          }

          return { ...old, pages: newPages };
        }
      );

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyDraft(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
    },
    onError: (_err, { sessionId }, context) => {
      // Rollback to previous state on error
      if (context?.previousInfinite) {
        queryClient.setQueryData(messageKeys.infinite(sessionId), context.previousInfinite);
      }
    },
    ...options,
  });
}

/**
 * Skip refinement (Acceptance Check).
 */
export function useSkipRefinement(
  options?: Omit<
    UseMutationOptions<
      SkipRefinementResponse,
      ApiClientError,
      { sessionId: string } & SkipRefinementRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, ...request }) => {
      return post<SkipRefinementResponse>(
        `/sessions/${sessionId}/empathy/skip-refinement`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

/**
 * Save validation feedback draft.
 */
export function useSaveValidationFeedbackDraft(
  options?: Omit<
    UseMutationOptions<
      SaveValidationFeedbackDraftResponse,
      ApiClientError,
      { sessionId: string } & SaveValidationFeedbackDraftRequest
    >,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async ({ sessionId, ...request }) => {
      return post<SaveValidationFeedbackDraftResponse>(
        `/sessions/${sessionId}/empathy/feedback/draft`,
        request
      );
    },
    ...options,
  });
}

/**
 * Refine validation feedback (AI Coach).
 */
export function useRefineValidationFeedback(
  options?: Omit<
    UseMutationOptions<
      RefineValidationFeedbackResponse,
      ApiClientError,
      { sessionId: string } & RefineValidationFeedbackRequest
    >,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: async ({ sessionId, ...request }) => {
      return post<RefineValidationFeedbackResponse>(
        `/sessions/${sessionId}/empathy/feedback/refine`,
        request
      );
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
