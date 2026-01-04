/**
 * Inner Thoughts Session Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for Inner Thoughts (solo self-reflection) session operations.
 * These sessions can optionally be linked to partner sessions for context-aware reflection.
 */

import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { get, post, patch, del } from '../lib/api';
import { ApiClientError } from '../lib/api';
import {
  InnerWorkSessionSummaryDTO,
  InnerWorkSessionDetailDTO,
  InnerWorkMessageDTO,
  CreateInnerWorkSessionRequest,
  CreateInnerWorkSessionResponse,
  ListInnerWorkSessionsResponse,
  GetInnerWorkSessionResponse,
  SendInnerWorkMessageRequest,
  SendInnerWorkMessageResponse,
  UpdateInnerWorkSessionRequest,
  UpdateInnerWorkSessionResponse,
  ArchiveInnerWorkSessionResponse,
  InnerWorkStatus,
} from '@meet-without-fear/shared';

// ============================================================================
// Query Keys
// ============================================================================

export const innerThoughtsKeys = {
  all: ['innerThoughts'] as const,
  lists: () => [...innerThoughtsKeys.all, 'list'] as const,
  list: (filters?: { status?: InnerWorkStatus }) =>
    [...innerThoughtsKeys.lists(), filters] as const,
  details: () => [...innerThoughtsKeys.all, 'detail'] as const,
  detail: (id: string) => [...innerThoughtsKeys.details(), id] as const,
  linked: (partnerSessionId: string) =>
    [...innerThoughtsKeys.all, 'linked', partnerSessionId] as const,
};

// Legacy alias for backwards compatibility
export const innerWorkKeys = innerThoughtsKeys;

// ============================================================================
// List Inner Thoughts Sessions Hook
// ============================================================================

export interface ListInnerThoughtsParams {
  status?: InnerWorkStatus;
  limit?: number;
  offset?: number;
}

/**
 * Fetch a list of Inner Thoughts sessions.
 */
export function useInnerThoughtsSessions(
  params: ListInnerThoughtsParams = {},
  options?: Omit<
    UseQueryOptions<ListInnerWorkSessionsResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: innerThoughtsKeys.list({ status: params.status }),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (params.offset) queryParams.set('offset', params.offset.toString());

      const queryString = queryParams.toString();
      const url = queryString ? `/inner-thoughts?${queryString}` : '/inner-thoughts';
      return get<ListInnerWorkSessionsResponse>(url);
    },
    staleTime: 5_000, // 5 seconds - short to catch async metadata updates
    ...options,
  });
}

// Legacy alias
export const useInnerWorkSessions = useInnerThoughtsSessions;

// ============================================================================
// Infinite List Inner Thoughts Sessions Hook (for infinite scroll)
// ============================================================================

const DEFAULT_PAGE_SIZE = 15;

/**
 * Fetch Inner Thoughts sessions with infinite scroll pagination.
 * Sessions are sorted by most recent message (updatedAt).
 */
export function useInnerThoughtsSessionsInfinite(
  params: { status?: InnerWorkStatus; pageSize?: number } = {},
  options?: { enabled?: boolean; staleTime?: number }
) {
  const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: [...innerThoughtsKeys.lists(), 'infinite', { status: params.status, pageSize }],
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      queryParams.set('limit', pageSize.toString());
      queryParams.set('offset', pageParam.toString());

      const url = `/inner-thoughts?${queryParams.toString()}`;
      return get<ListInnerWorkSessionsResponse>(url);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      // Calculate total items loaded so far
      const totalLoaded = allPages.reduce((sum, page) => sum + page.sessions.length, 0);
      return totalLoaded;
    },
    staleTime: options?.staleTime ?? 5_000, // 5 seconds - short to catch async metadata updates
    enabled: options?.enabled,
  });
}

// ============================================================================
// Get Inner Thoughts Session Hook
// ============================================================================

/**
 * Fetch a single Inner Thoughts session with messages.
 */
export function useInnerThoughtsSession(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<GetInnerWorkSessionResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: innerThoughtsKeys.detail(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<GetInnerWorkSessionResponse>(`/inner-thoughts/${sessionId}`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

// Legacy alias
export const useInnerWorkSession = useInnerThoughtsSession;

// ============================================================================
// Create Inner Thoughts Session Hook
// ============================================================================

export interface CreateInnerThoughtsRequest extends CreateInnerWorkSessionRequest {
  /** Optional: Link to a partner session for context-aware reflection */
  linkedPartnerSessionId?: string;
  /** Stage when Inner Thoughts was opened (for context) */
  linkedAtStage?: number;
  /** Why it was opened: "empathy_wait", "voluntary", "witness_wait" */
  linkedTrigger?: string;
}

/**
 * Create a new Inner Thoughts session.
 * Can optionally be linked to a partner session for context-aware reflection.
 */
export function useCreateInnerThoughtsSession(
  options?: Omit<
    UseMutationOptions<
      CreateInnerWorkSessionResponse,
      ApiClientError,
      CreateInnerThoughtsRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateInnerThoughtsRequest) => {
      return post<CreateInnerWorkSessionResponse, CreateInnerThoughtsRequest>(
        '/inner-thoughts',
        request
      );
    },
    onSuccess: (data, variables) => {
      // Invalidate session list to show new session
      queryClient.invalidateQueries({ queryKey: innerThoughtsKeys.lists() });

      // Pre-populate the cache with the new session detail
      queryClient.setQueryData(innerThoughtsKeys.detail(data.session.id), {
        session: {
          ...data.session,
          messages: [data.initialMessage],
        },
      });

      // If linked, cache the linked relationship
      if (variables.linkedPartnerSessionId) {
        queryClient.setQueryData(
          innerThoughtsKeys.linked(variables.linkedPartnerSessionId),
          { innerThoughtsSessionId: data.session.id }
        );
      }
    },
    ...options,
  });
}

// Legacy alias
export const useCreateInnerWorkSession = useCreateInnerThoughtsSession;

// ============================================================================
// Get or Create Linked Inner Thoughts Session Hook
// ============================================================================

/**
 * Get an existing linked Inner Thoughts session for a partner session,
 * or information needed to create one.
 */
export function useLinkedInnerThoughts(
  partnerSessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<{ innerThoughtsSessionId: string | null }, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: innerThoughtsKeys.linked(partnerSessionId || ''),
    queryFn: async () => {
      if (!partnerSessionId) throw new Error('Partner session ID is required');
      return get<{ innerThoughtsSessionId: string | null }>(
        `/sessions/${partnerSessionId}/inner-thoughts`
      );
    },
    enabled: !!partnerSessionId,
    staleTime: 60_000, // 1 minute
    ...options,
  });
}

// ============================================================================
// Send Inner Thoughts Message Hook
// ============================================================================

/**
 * Send a message in an Inner Thoughts session and get AI response.
 * Uses optimistic updates to show user message immediately.
 */
// Context type for optimistic update rollback
interface SendMessageContext {
  previousData: GetInnerWorkSessionResponse | undefined;
}

export function useSendInnerThoughtsMessage(
  sessionId: string,
  options?: Omit<
    UseMutationOptions<
      SendInnerWorkMessageResponse,
      ApiClientError,
      SendInnerWorkMessageRequest,
      SendMessageContext
    >,
    'mutationFn' | 'onMutate' | 'onError' | 'onSuccess'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: SendInnerWorkMessageRequest) => {
      return post<SendInnerWorkMessageResponse, SendInnerWorkMessageRequest>(
        `/inner-thoughts/${sessionId}/messages`,
        request
      );
    },
    // Optimistic update: show user message immediately
    onMutate: async (newMessage): Promise<SendMessageContext> => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: innerThoughtsKeys.detail(sessionId) });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<GetInnerWorkSessionResponse>(
        innerThoughtsKeys.detail(sessionId)
      );

      // Optimistically add the user message
      const optimisticUserMessage: InnerWorkMessageDTO = {
        id: `optimistic-${Date.now()}`,
        role: 'USER',
        content: newMessage.content,
        timestamp: new Date().toISOString(),
      };

      queryClient.setQueryData<GetInnerWorkSessionResponse>(
        innerThoughtsKeys.detail(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            session: {
              ...old.session,
              messages: [...old.session.messages, optimisticUserMessage],
              messageCount: old.session.messageCount + 1,
            },
          };
        }
      );

      // Return context with the previous data for rollback
      return { previousData };
    },
    onError: (_err: ApiClientError, _newMessage: SendInnerWorkMessageRequest, context: SendMessageContext | undefined) => {
      // Rollback to the previous state on error
      if (context?.previousData) {
        queryClient.setQueryData(
          innerThoughtsKeys.detail(sessionId),
          context.previousData
        );
      }
    },
    onSuccess: (data: SendInnerWorkMessageResponse) => {
      // Replace optimistic message with real messages from server
      queryClient.setQueryData<GetInnerWorkSessionResponse>(
        innerThoughtsKeys.detail(sessionId),
        (old) => {
          if (!old) return old;
          // Remove the optimistic message and add real messages
          const messagesWithoutOptimistic = old.session.messages.filter(
            (msg) => !msg.id.startsWith('optimistic-')
          );
          return {
            ...old,
            session: {
              ...old.session,
              messages: [
                ...messagesWithoutOptimistic,
                data.userMessage,
                data.aiMessage,
              ],
              messageCount: messagesWithoutOptimistic.length + 2,
              updatedAt: data.aiMessage.timestamp,
            },
          };
        }
      );

      // Invalidate session list immediately for timestamp updates
      queryClient.invalidateQueries({ queryKey: innerThoughtsKeys.lists() });

      // Invalidate again after a delay to catch the async metadata update (title/summary)
      // Haiku typically completes in ~1-2 seconds
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: innerThoughtsKeys.lists() });
      }, 2500);
    },
    ...options,
  });
}

// Legacy alias
export const useSendInnerWorkMessage = useSendInnerThoughtsMessage;

// ============================================================================
// Update Inner Thoughts Session Hook
// ============================================================================

/**
 * Update an Inner Thoughts session (title, status).
 */
export function useUpdateInnerThoughtsSession(
  sessionId: string,
  options?: Omit<
    UseMutationOptions<
      UpdateInnerWorkSessionResponse,
      ApiClientError,
      UpdateInnerWorkSessionRequest
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: UpdateInnerWorkSessionRequest) => {
      return patch<UpdateInnerWorkSessionResponse, UpdateInnerWorkSessionRequest>(
        `/inner-thoughts/${sessionId}`,
        request
      );
    },
    onSuccess: (data) => {
      // Update session detail cache
      queryClient.setQueryData<GetInnerWorkSessionResponse>(
        innerThoughtsKeys.detail(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            session: {
              ...old.session,
              ...data.session,
            },
          };
        }
      );

      // Invalidate session list
      queryClient.invalidateQueries({ queryKey: innerThoughtsKeys.lists() });
    },
    ...options,
  });
}

// Legacy alias
export const useUpdateInnerWorkSession = useUpdateInnerThoughtsSession;

// ============================================================================
// Archive Inner Thoughts Session Hook
// ============================================================================

/**
 * Archive an Inner Thoughts session.
 */
export function useArchiveInnerThoughtsSession(
  options?: Omit<
    UseMutationOptions<
      ArchiveInnerWorkSessionResponse,
      ApiClientError,
      { sessionId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return del<ArchiveInnerWorkSessionResponse>(`/inner-thoughts/${sessionId}`);
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate session lists
      queryClient.invalidateQueries({ queryKey: innerThoughtsKeys.lists() });
      // Invalidate the specific session detail
      queryClient.invalidateQueries({ queryKey: innerThoughtsKeys.detail(sessionId) });
    },
    ...options,
  });
}

// Legacy alias
export const useArchiveInnerWorkSession = useArchiveInnerThoughtsSession;
