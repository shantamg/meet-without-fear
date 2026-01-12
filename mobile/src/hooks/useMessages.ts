/**
 * Message Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for chat messages and emotional barometer.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  useInfiniteQuery,
  InfiniteData,
} from '@tanstack/react-query';
import { get, post, ApiClientError } from '../lib/api';
import {
  MessageDTO,
  MessageRole,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesResponse,
  RecordEmotionalReadingRequest,
  RecordEmotionalReadingResponse,
  GetEmotionalHistoryResponse,
  CompleteExerciseRequest,
  CompleteExerciseResponse,
  Stage,
} from '@meet-without-fear/shared';

// Import query keys from centralized file to avoid circular dependencies
import {
  sessionKeys,
  stageKeys,
  messageKeys,
} from './queryKeys';

// Re-export for backwards compatibility
export { messageKeys };

// ============================================================================
// Types
// ============================================================================

export interface GetMessagesParams {
  sessionId: string;
  stage?: Stage;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// Get Messages Hook
// ============================================================================

/**
 * Fetch messages for a session with optional stage filter.
 *
 * @param params - Query parameters
 * @param options - React Query options
 */
export function useMessages(
  params: GetMessagesParams,
  options?: Omit<
    UseQueryOptions<GetMessagesResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const { sessionId, stage, limit, cursor } = params;

  return useQuery({
    queryKey: messageKeys.list(sessionId, stage),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (stage !== undefined) queryParams.set('stage', stage.toString());
      if (limit) queryParams.set('limit', limit.toString());
      if (cursor) queryParams.set('cursor', cursor);

      const queryString = queryParams.toString();
      const url = queryString
        ? `/sessions/${sessionId}/messages?${queryString}`
        : `/sessions/${sessionId}/messages`;

      return get<GetMessagesResponse>(url);
    },
    enabled: !!sessionId,
    staleTime: 10_000, // 10 seconds - messages update frequently
    ...options,
  });
}

/** Options for useInfiniteMessages hook */
export interface UseInfiniteMessagesOptions {
  enabled?: boolean;
}

/** Return type for useInfiniteMessages hook */
export interface UseInfiniteMessagesResult {
  data: InfiniteData<GetMessagesResponse> | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  refetch: () => void;
}

/**
 * Fetch messages with infinite scroll pagination.
 * Initial load gets newest messages (order: desc, reversed on server).
 * Loading more fetches older messages using 'before' cursor.
 */
export function useInfiniteMessages(
  params: Omit<GetMessagesParams, 'cursor'>,
  options?: UseInfiniteMessagesOptions
): UseInfiniteMessagesResult {
  const { sessionId, stage, limit = 25 } = params;

  const result = useInfiniteQuery({
    queryKey: messageKeys.infinite(sessionId, stage),
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      if (stage !== undefined) queryParams.set('stage', stage.toString());
      queryParams.set('limit', limit.toString());

      // First page: get newest messages (default order is 'desc')
      // Subsequent pages: get older messages using 'before' cursor with 'asc' order
      if (pageParam) {
        queryParams.set('before', pageParam as string);
        queryParams.set('order', 'asc');
      }

      const url = `/sessions/${sessionId}/messages?${queryParams.toString()}`;
      return get<GetMessagesResponse>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined;
      // Return the oldest message's timestamp as the cursor for the next page
      return lastPage.messages[0]?.timestamp;
    },
    enabled: options?.enabled ?? !!sessionId,
    staleTime: 60_000, // 1 minute - keep data fresh longer
    gcTime: 300_000, // 5 minutes - keep in cache longer (formerly cacheTime)
    refetchOnMount: 'always', // Always refetch when session opens to ensure fresh messages
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage ?? false,
    isFetchingNextPage: result.isFetchingNextPage,
    refetch: result.refetch,
  };
}

// ============================================================================
// Send Message Hook
// ============================================================================

export interface SendMessageParams {
  sessionId: string;
  content: string;
  emotionalIntensity?: number;
  emotionalContext?: string;
  /** Optional current stage (for optimistic message placement) */
  currentStage?: Stage;
}

/**
 * Context stored by onMutate for rollback on error.
 */
interface SendMessageContext {
  optimisticId: string;
  previousInfinite: InfiniteData<GetMessagesResponse> | undefined;
  previousList: GetMessagesResponse | undefined;
}

/**
 * Send a message in a session.
 *
 * Cache-First Architecture:
 * - onMutate: Immediately adds user message to cache with temp ID and status: 'sending'
 * - onSuccess: Replaces optimistic message with real one from server
 * - onError: Rolls back to previous cache state
 *
 * Fire-and-forget pattern:
 * - Returns immediately with user message only
 * - AI response arrives asynchronously via Ably (message.ai_response event)
 * - Use useAIMessageHandler to add AI responses to the cache
 *
 * UI derives "waiting for AI" state from the last message being from USER role,
 * eliminating the need for a separate waitingForAIResponse boolean.
 */
export function useSendMessage(
  options?: Omit<
    UseMutationOptions<SendMessageResponse, ApiClientError, SendMessageParams, SendMessageContext>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<SendMessageResponse, ApiClientError, SendMessageParams, SendMessageContext>({
    mutationFn: async ({
      sessionId,
      content,
      emotionalIntensity,
      emotionalContext,
    }: SendMessageParams) => {
      const request: SendMessageRequest = {
        sessionId,
        content,
        emotionalIntensity,
        emotionalContext,
      };
      return post<SendMessageResponse, SendMessageRequest>(
        `/sessions/${sessionId}/messages`,
        request
      );
    },
    retry: false, // Disable automatic retries to prevent duplicate messages

    // =========================================================================
    // OPTIMISTIC UPDATE: Add user message to cache immediately
    // =========================================================================
    onMutate: async ({ sessionId, content, currentStage }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: messageKeys.infinite(sessionId) });
      await queryClient.cancelQueries({ queryKey: messageKeys.list(sessionId) });

      // Snapshot the previous values for rollback
      const previousInfinite = queryClient.getQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId)
      );
      const previousList = queryClient.getQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId)
      );

      // Create optimistic message with temp ID
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: MessageDTO = {
        id: optimisticId,
        sessionId,
        senderId: null, // Will be set by server
        role: MessageRole.USER,
        content,
        stage: currentStage ?? Stage.ONBOARDING,
        timestamp: new Date().toISOString(),
      };

      // Helper to add optimistic message to regular cache
      const addToCache = (old: GetMessagesResponse | undefined): GetMessagesResponse => {
        if (!old) {
          return { messages: [optimisticMessage], hasMore: false };
        }
        return {
          ...old,
          messages: [...(old.messages || []), optimisticMessage],
        };
      };

      // Helper to add optimistic message to infinite cache
      const addToInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ messages: [optimisticMessage], hasMore: false }],
            pageParams: [undefined],
          };
        }
        // Add to the first page (newest messages)
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        updatedPages[0] = {
          ...firstPage,
          messages: [...(firstPage.messages || []), optimisticMessage],
        };
        return { ...old, pages: updatedPages };
      };

      // Update caches optimistically
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        addToCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        addToInfiniteCache
      );

      // Also update stage-specific caches if we know the stage
      if (currentStage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, currentStage),
          addToCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, currentStage),
          addToInfiniteCache
        );
      }

      // Return context for potential rollback
      return { optimisticId, previousInfinite, previousList };
    },

    // =========================================================================
    // SUCCESS: Replace optimistic message with real one
    // =========================================================================
    onSuccess: (data, { sessionId }, context) => {
      const stage = data.userMessage.stage;

      // Fire-and-forget: Only add user message to cache immediately
      // AI response will arrive via Ably and be added by useAIMessageHandler
      const messagesToAdd = data.aiResponse
        ? [data.userMessage, data.aiResponse]
        : [data.userMessage];

      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return {
            messages: messagesToAdd,
            hasMore: false,
          };
        }
        // Filter out optimistic messages (they start with 'optimistic-')
        // and check for duplicates before adding the real messages from the API response
        const existingMessages = (old.messages || []).filter(
          (m) => !m.id.startsWith('optimistic-')
        );
        const existingIds = new Set(existingMessages.map((m) => m.id));
        const newMessages = messagesToAdd.filter(
          (m) => !existingIds.has(m.id)
        );
        return {
          ...old,
          messages: [...existingMessages, ...newMessages],
        };
      };

      // Update infinite query cache (used by useUnifiedSession)
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) return old;
        // Update the first page (newest messages)
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        const existingMessages = (firstPage.messages || []).filter(
          (m) => !m.id.startsWith('optimistic-')
        );
        const existingIds = new Set(existingMessages.map((m) => m.id));
        const newMessages = messagesToAdd.filter(
          (m) => !existingIds.has(m.id)
        );
        updatedPages[0] = {
          ...firstPage,
          messages: [...existingMessages, ...newMessages],
        };
        return { ...old, pages: updatedPages };
      };

      // Update stage-specific cache (what witness screen uses)
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
      }

      // Also update non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );

      // Update infinite query caches
      if (stage !== undefined) {
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      // NOTE: We do NOT invalidate message queries here because we've already manually updated
      // the cache with setQueryData above. Invalidating would trigger a refetch that could
      // cause duplicate messages if the server returns the same messages we just added.
      // Only invalidate related queries that need fresh data from the server.

      // Session might have progressed - invalidate session detail and progress
      // Progress invalidation is critical: when user sends first message at Stage 0,
      // backend auto-advances to Stage 1. Without this, useMessages would keep
      // querying for Stage 0 messages while new messages are saved at Stage 1.
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: stageKeys.progress(sessionId) });
      // Also invalidate consolidated state so stage-dependent UI (like feel-heard card) updates
      queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });

      // Invitation message might have been updated during invitation phase
      // This ensures the share button appears immediately when AI proposes a message
      queryClient.invalidateQueries({ queryKey: sessionKeys.sessionInvitation(sessionId) });
    },

    // =========================================================================
    // ERROR: Rollback to previous cache state
    // =========================================================================
    onError: (_error, { sessionId }, context) => {
      // If we have context, rollback to previous state
      if (context) {
        if (context.previousList !== undefined) {
          queryClient.setQueryData(messageKeys.list(sessionId), context.previousList);
        }
        if (context.previousInfinite !== undefined) {
          queryClient.setQueryData(messageKeys.infinite(sessionId), context.previousInfinite);
        }
      }
    },

    ...options,
  });
}

// ============================================================================
// AI Message Handler Hook (for Fire-and-Forget Ably messages)
// ============================================================================

/**
 * Hook to add AI messages from Ably events to the React Query cache.
 * Used for fire-and-forget message pattern where AI response arrives via Ably.
 */
export function useAIMessageHandler() {
  const queryClient = useQueryClient();

  return {
    /**
     * Add an AI message from Ably to the cache.
     * Called when message.ai_response event is received.
     */
    addAIMessage: (sessionId: string, message: MessageDTO) => {
      const stage = message.stage;

      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [message], hasMore: false };
        }
        // Check for duplicates
        const existingIds = new Set((old.messages || []).map((m) => m.id));
        if (existingIds.has(message.id)) {
          return old; // Already have this message
        }
        return {
          ...old,
          messages: [...(old.messages || []), message],
        };
      };

      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ messages: [message], hasMore: false }],
            pageParams: [undefined],
          };
        }
        // Update the first page (newest messages)
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        const existingIds = new Set((firstPage.messages || []).map((m) => m.id));
        if (existingIds.has(message.id)) {
          return old; // Already have this message
        }
        updatedPages[0] = {
          ...firstPage,
          messages: [...(firstPage.messages || []), message],
        };
        return { ...old, pages: updatedPages };
      };

      // Update stage-specific cache
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }

      // Also update non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      console.log(`[useAIMessageHandler] Added AI message ${message.id} to cache for session ${sessionId}`);
    },

    /**
     * Handle AI message error from Ably.
     * Called when message.error event is received.
     * Returns error info for the UI to handle.
     */
    handleAIMessageError: (sessionId: string, userMessageId: string, errorMessage: string, canRetry: boolean) => {
      console.error(`[useAIMessageHandler] AI message error for session ${sessionId}:`, errorMessage);
      // Return error info so the component can display appropriate UI
      return {
        sessionId,
        userMessageId,
        errorMessage,
        canRetry,
      };
    },
  };
}

// ============================================================================
// Emotional Barometer Hooks
// ============================================================================

/**
 * Get emotional reading history for a session.
 */
export function useEmotionalHistory(
  params: { sessionId: string; stage?: Stage; limit?: number },
  options?: Omit<
    UseQueryOptions<GetEmotionalHistoryResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const { sessionId, stage, limit } = params;

  return useQuery({
    queryKey: messageKeys.emotionHistory(sessionId, stage),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (stage !== undefined) queryParams.set('stage', stage.toString());
      if (limit) queryParams.set('limit', limit.toString());

      const queryString = queryParams.toString();
      const url = queryString
        ? `/sessions/${sessionId}/emotions?${queryString}`
        : `/sessions/${sessionId}/emotions`;

      return get<GetEmotionalHistoryResponse>(url);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Record an emotional reading.
 */
export function useRecordEmotion(
  options?: Omit<
    UseMutationOptions<
      RecordEmotionalReadingResponse,
      ApiClientError,
      RecordEmotionalReadingRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: RecordEmotionalReadingRequest) => {
      return post<RecordEmotionalReadingResponse, RecordEmotionalReadingRequest>(
        `/sessions/${request.sessionId}/emotions`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.emotionHistory(sessionId),
      });
    },
    ...options,
  });
}

/**
 * Complete an emotional support exercise (breathing, body scan, etc.).
 */
export function useCompleteExercise(
  options?: Omit<
    UseMutationOptions<CompleteExerciseResponse, ApiClientError, CompleteExerciseRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CompleteExerciseRequest) => {
      return post<CompleteExerciseResponse, CompleteExerciseRequest>(
        `/sessions/${request.sessionId}/exercises/complete`,
        request
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.emotionHistory(sessionId),
      });
    },
    ...options,
  });
}

// ============================================================================
// Optimistic Update Helpers
// ============================================================================

/**
 * Add a message optimistically before the API call completes.
 * Used for immediate UI feedback.
 */
export function useOptimisticMessage() {
  const queryClient = useQueryClient();

  return {
    addOptimisticMessage: (sessionId: string, message: Partial<MessageDTO>) => {
      const stage = message.stage;
      const optimisticMessage: MessageDTO = {
        id: `optimistic-${Date.now()}`,
        sessionId,
        senderId: null,
        role: MessageRole.USER,
        content: message.content || '',
        stage: stage || Stage.ONBOARDING,
        timestamp: new Date().toISOString(),
        ...message,
      };

      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [optimisticMessage], hasMore: false };
        }
        return {
          ...old,
          messages: [...(old.messages || []), optimisticMessage],
        };
      };

      // Update infinite query cache
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          // Create initial structure for infinite query
          return {
            pages: [{ messages: [optimisticMessage], hasMore: false }],
            pageParams: [undefined],
          };
        }
        // Update the first page (newest messages)
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        updatedPages[0] = {
          ...firstPage,
          messages: [...(firstPage.messages || []), optimisticMessage],
        };
        return { ...old, pages: updatedPages };
      };

      // Update stage-specific cache (what witness screen uses)
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }

      // Also update non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      return optimisticMessage.id;
    },

    removeOptimisticMessage: (sessionId: string, optimisticId: string, stage?: Stage) => {
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          messages: (old.messages || []).filter((m) => m.id !== optimisticId),
        };
      };

      // Update infinite query cache
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) return old;
        const updatedPages = old.pages.map((page) => ({
          ...page,
          messages: (page.messages || []).filter((m) => m.id !== optimisticId),
        }));
        return { ...old, pages: updatedPages };
      };

      // Remove from stage-specific cache
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }

      // Remove from non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );
    },
  };
}

// ============================================================================
// Initial Message Hook
// ============================================================================

interface InitialMessageResponse {
  message: MessageDTO;
  invitationMessage?: string | null;
}

/**
 * Fetch AI-generated initial message for a session.
 * Called when starting a new session that has no messages yet.
 */
export function useFetchInitialMessage(
  options?: Omit<
    UseMutationOptions<InitialMessageResponse, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      console.log('[useFetchInitialMessage] Calling API for session:', sessionId);
      return post<InitialMessageResponse, Record<string, never>>(
        `/sessions/${sessionId}/messages/initial`,
        {}
      );
    },
    onSuccess: (data, { sessionId }) => {
      console.log('[useFetchInitialMessage] Success! Message:', data.message.content.substring(0, 50));
      const stage = data.message.stage;

      // Add the AI message to the cache
      const updateCache = (old: GetMessagesResponse | undefined) => {
        if (!old) {
          return { messages: [data.message], hasMore: false };
        }
        return {
          ...old,
          messages: [...(old.messages || []), data.message],
        };
      };

      // Update infinite query cache
      const updateInfiniteCache = (
        old: InfiniteData<GetMessagesResponse> | undefined
      ): InfiniteData<GetMessagesResponse> | undefined => {
        if (!old || old.pages.length === 0) {
          return {
            pages: [{ messages: [data.message], hasMore: false }],
            pageParams: [undefined],
          };
        }
        const updatedPages = [...old.pages];
        const firstPage = updatedPages[0];
        updatedPages[0] = {
          ...firstPage,
          messages: [data.message, ...(firstPage.messages || [])],
        };
        return { ...old, pages: updatedPages };
      };

      // Update stage-specific cache
      if (stage !== undefined) {
        queryClient.setQueryData<GetMessagesResponse>(
          messageKeys.list(sessionId, stage),
          updateCache
        );
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId, stage),
          updateInfiniteCache
        );
      }

      // Also update non-stage-filtered cache
      queryClient.setQueryData<GetMessagesResponse>(
        messageKeys.list(sessionId),
        updateCache
      );
      queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
        messageKeys.infinite(sessionId),
        updateInfiniteCache
      );

      // If an invitation message was returned, invalidate invitation queries
      if (data.invitationMessage) {
        queryClient.invalidateQueries({ queryKey: sessionKeys.sessionInvitation(sessionId) });
      }

      console.log('[useFetchInitialMessage] Cache updated for session:', sessionId);
    },
    onError: (error, { sessionId }) => {
      console.error('[useFetchInitialMessage] Error fetching initial message:', error, 'session:', sessionId);
    },
    ...options,
  });
}
