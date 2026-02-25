/**
 * Session Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for session-related API operations.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  InfiniteData,
} from '@tanstack/react-query';
import { get, post, put, del, ApiClientError } from '../lib/api';
import {
  SessionSummaryDTO,
  SessionDetailDTO,
  CreateSessionRequest,
  CreateSessionResponse,
  SessionStatus,
  StageStatus,
  PaginatedResponse,
  AcceptInvitationResponse,
  DeclineInvitationResponse,
  InvitationDTO,
  Stage,
  GetMessagesResponse,
  MessageRole,
  SessionStateResponse,
  TimelineResponse,
  ChatItemType,
  IndicatorType,
  IndicatorItem,
  AIMessageItem,
  AIMessageStatus,
} from '@meet-without-fear/shared';

// Import query keys from centralized file to avoid circular dependencies
import {
  sessionKeys,
  stageKeys,
  messageKeys,
  timelineKeys,
  notificationKeys,
} from './queryKeys';

// Re-export for backwards compatibility
export { sessionKeys };

// ============================================================================
// Types
// ============================================================================

export interface ListSessionsParams {
  status?: SessionStatus;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// List Sessions Hook
// ============================================================================

/**
 * Fetch a paginated list of sessions.
 *
 * @param params - Query parameters for filtering and pagination
 * @param options - React Query options
 */
export function useSessions(
  params: ListSessionsParams = {},
  options?: Omit<
    UseQueryOptions<PaginatedResponse<SessionSummaryDTO>, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.list({ status: params.status }),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (params.cursor) queryParams.set('cursor', params.cursor);

      const queryString = queryParams.toString();
      const url = queryString ? `/sessions?${queryString}` : '/sessions';
      return get<PaginatedResponse<SessionSummaryDTO>>(url);
    },
    staleTime: 30_000, // 30 seconds
    ...options,
  });
}

/**
 * Fetch sessions with infinite scroll pagination.
 */
export function useInfiniteSessions(
  params: Omit<ListSessionsParams, 'cursor'> = {},
  options?: Omit<
    UseInfiniteQueryOptions<PaginatedResponse<SessionSummaryDTO>, ApiClientError>,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >
) {
  return useInfiniteQuery({
    queryKey: sessionKeys.list({ status: params.status }),
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (pageParam) queryParams.set('cursor', pageParam as string);

      const queryString = queryParams.toString();
      const url = queryString ? `/sessions?${queryString}` : '/sessions';
      return get<PaginatedResponse<SessionSummaryDTO>>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.cursor : undefined,
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Get Session Detail Hook
// ============================================================================

/**
 * Fetch a single session by ID with full details.
 *
 * @param sessionId - The session ID to fetch
 * @param options - React Query options
 */
export function useSession(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<{ session: SessionDetailDTO }, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<{ session: SessionDetailDTO }>(`/sessions/${sessionId}`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Create Session Hook
// ============================================================================

/**
 * Create a new session and send invitation.
 */
export function useCreateSession(
  options?: Omit<
    UseMutationOptions<CreateSessionResponse, ApiClientError, CreateSessionRequest>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateSessionRequest) => {
      return post<CreateSessionResponse, CreateSessionRequest>('/sessions', request);
    },
    onSuccess: (data) => {
      // Invalidate session list to show new session
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });

      // Pre-populate the cache with the new session
      queryClient.setQueryData(sessionKeys.detail(data.session.id), {
        session: data.session,
      });
    },
    ...options,
  });
}

// ============================================================================
// Pause Session Hook
// ============================================================================

/**
 * Pause an active session.
 */
export function usePauseSession(
  options?: Omit<
    UseMutationOptions<
      { paused: boolean; pausedAt: string },
      ApiClientError,
      { sessionId: string; reason?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, reason }) => {
      return post<{ paused: boolean; pausedAt: string }, { reason?: string }>(
        `/sessions/${sessionId}/pause`,
        { reason }
      );
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
    },
    ...options,
  });
}

// ============================================================================
// Resume Session Hook
// ============================================================================

/**
 * Resume a paused session.
 */
export function useResumeSession(
  options?: Omit<
    UseMutationOptions<{ resumed: boolean; resumedAt: string }, ApiClientError, { sessionId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<{ resumed: boolean; resumedAt: string }>(`/sessions/${sessionId}/resume`);
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
    },
    ...options,
  });
}

// ============================================================================
// Invitation Hooks
// ============================================================================

/**
 * Get invitation details by ID.
 */
export function useInvitation(
  invitationId: string | undefined,
  options?: Omit<
    UseQueryOptions<{ invitation: InvitationDTO }, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.invitation(invitationId || ''),
    queryFn: async () => {
      if (!invitationId) throw new Error('Invitation ID is required');
      return get<{ invitation: InvitationDTO }>(`/invitations/${invitationId}`);
    },
    enabled: !!invitationId,
    ...options,
  });
}

/**
 * Accept a session invitation.
 */
export function useAcceptInvitation(
  options?: Omit<
    UseMutationOptions<AcceptInvitationResponse, ApiClientError, { invitationId: string }>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invitationId }) => {
      return post<AcceptInvitationResponse>(`/invitations/${invitationId}/accept`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.invitations() });

      // Pre-populate session cache
      queryClient.setQueryData(sessionKeys.detail(data.session.id), {
        session: data.session,
      });
    },
    ...options,
  });
}

/**
 * Decline a session invitation.
 */
export function useDeclineInvitation(
  options?: Omit<
    UseMutationOptions<
      DeclineInvitationResponse,
      ApiClientError,
      { invitationId: string; reason?: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invitationId, reason }) => {
      return post<DeclineInvitationResponse>(`/invitations/${invitationId}/decline`, {
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.invitations() });
    },
    ...options,
  });
}

/**
 * Resend a session invitation.
 */
export function useResendInvitation(
  options?: Omit<
    UseMutationOptions<
      { sent: boolean; sentAt: string; expiresAt: string },
      ApiClientError,
      { invitationId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invitationId }) => {
      return post<{ sent: boolean; sentAt: string; expiresAt: string }>(
        `/invitations/${invitationId}/resend`
      );
    },
    onSuccess: (_, { invitationId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.invitation(invitationId),
      });
    },
    ...options,
  });
}

// ============================================================================
// Session Invitation Message Hooks
// ============================================================================

interface SessionInvitationResponse {
  invitation: {
    id: string;
    name: string | null;
    invitationMessage: string | null;
    messageConfirmed: boolean;
    /** When the user confirmed the invitation message (for chat indicator positioning) */
    messageConfirmedAt: string | null;
    /** When the invitation was accepted by the invitee */
    acceptedAt: string | null;
    status: string;
    expiresAt: string;
    /** Whether the current user is the inviter (true) or invitee (false) */
    isInviter: boolean;
  };
}

/**
 * Get invitation details for a session.
 */
export function useSessionInvitation(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<SessionInvitationResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: sessionKeys.sessionInvitation(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return get<SessionInvitationResponse>(`/sessions/${sessionId}/invitation`);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Update the invitation message for a session.
 */
export function useUpdateInvitationMessage(
  options?: Omit<
    UseMutationOptions<
      { invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean } },
      ApiClientError,
      { sessionId: string; message: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, message }) => {
      return put<{ invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean } }>(
        `/sessions/${sessionId}/invitation/message`,
        { message }
      );
    },
    onSuccess: (_data, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: sessionKeys.sessionInvitation(sessionId),
      });
    },
    ...options,
  });
}

/**
 * Context stored by onMutate for rollback on error.
 */
interface ConfirmInvitationContext {
  previousSessionState: SessionStateResponse | undefined;
  previousInvitation: { invitation?: InvitationDTO } | undefined;
  previousTimeline: InfiniteData<TimelineResponse, string | undefined> | undefined;
  optimisticTimestamp: string;
}

/**
 * Confirm the invitation message for a session.
 *
 * Cache-First Architecture:
 * - onMutate: Immediately updates invitation.messageConfirmedAt in cache
 * - onSuccess: Replaces optimistic data with real server response
 * - onError: Rolls back to previous cache state
 *
 * This ensures the "Invitation Sent" indicator appears immediately
 * without needing local state like isConfirmingInvitation or optimisticConfirmTimestamp.
 */
export function useConfirmInvitationMessage(
  options?: Omit<
    UseMutationOptions<
      {
        confirmed: boolean;
        invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean; messageConfirmedAt?: string };
        advancedToStage?: number;
        transitionMessage?: { id: string; content: string; timestamp: string };
      },
      ApiClientError,
      { sessionId: string; message?: string },
      ConfirmInvitationContext
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    {
      confirmed: boolean;
      invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean; messageConfirmedAt?: string };
      advancedToStage?: number;
      transitionMessage?: { id: string; content: string; timestamp: string };
    },
    ApiClientError,
    { sessionId: string; message?: string },
    ConfirmInvitationContext
  >({
    mutationFn: async ({ sessionId, message }) => {
      return post<{
        confirmed: boolean;
        invitation: { id: string; invitationMessage: string | null; messageConfirmed: boolean; messageConfirmedAt?: string };
        advancedToStage?: number;
        transitionMessage?: { id: string; content: string; timestamp: string };
      }>(`/sessions/${sessionId}/invitation/confirm`, { message });
    },

    // =========================================================================
    // OPTIMISTIC UPDATE: Update invitation cache immediately
    // =========================================================================
    onMutate: async ({ sessionId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: sessionKeys.state(sessionId) });
      await queryClient.cancelQueries({ queryKey: sessionKeys.sessionInvitation(sessionId) });
      await queryClient.cancelQueries({ queryKey: timelineKeys.infinite(sessionId) });

      // Snapshot previous values for rollback
      const previousSessionState = queryClient.getQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId)
      );
      const previousInvitation = queryClient.getQueryData<{ invitation?: InvitationDTO }>(
        sessionKeys.sessionInvitation(sessionId)
      );
      const previousTimeline = queryClient.getQueryData<InfiniteData<TimelineResponse, string | undefined>>(
        timelineKeys.infinite(sessionId)
      );

      const optimisticTimestamp = new Date().toISOString();

      // Optimistically update session state (consolidated state used by useUnifiedSession)
      queryClient.setQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            invitation: old.invitation ? {
              ...old.invitation,
              messageConfirmed: true,
              messageConfirmedAt: optimisticTimestamp,
            } : old.invitation,
          };
        }
      );

      // Optimistically update invitation query
      queryClient.setQueryData<{ invitation?: InvitationDTO }>(
        sessionKeys.sessionInvitation(sessionId),
        (old) => {
          if (!old?.invitation) return old;
          return {
            ...old,
            invitation: {
              ...old.invitation,
              messageConfirmed: true,
              messageConfirmedAt: optimisticTimestamp,
            },
          };
        }
      );

      // Optimistically add the "Invitation Sent" indicator to the timeline cache
      // This ensures the indicator appears immediately and persists through cache updates
      const indicatorItem: IndicatorItem = {
        type: ChatItemType.INDICATOR,
        id: 'invitation-sent',
        timestamp: optimisticTimestamp,
        indicatorType: IndicatorType.INVITATION_SENT,
      };

      queryClient.setQueryData<InfiniteData<TimelineResponse, string | undefined>>(
        timelineKeys.infinite(sessionId),
        (oldData): InfiniteData<TimelineResponse, string | undefined> => {
          if (!oldData || oldData.pages.length === 0) {
            return {
              pages: [{ items: [indicatorItem], hasMore: false }],
              pageParams: [undefined],
            };
          }

          // Check if indicator already exists
          const exists = oldData.pages.some(page =>
            page.items.some(item => item.id === 'invitation-sent')
          );
          if (exists) return oldData;

          // Add to first page
          const newPages = oldData.pages.map((page, index) => {
            if (index === 0) {
              return {
                ...page,
                items: [indicatorItem, ...page.items],
              };
            }
            return page;
          });

          return { ...oldData, pages: newPages };
        }
      );

      return { previousSessionState, previousInvitation, previousTimeline, optimisticTimestamp };
    },

    // =========================================================================
    // SUCCESS: Replace optimistic data with real response
    // Using setQueryData instead of invalidateQueries for invitation/state to prevent
    // race conditions that can overwrite optimistic messageConfirmedAt before
    // the server response settles (fix for disappearing indicator bug)
    // =========================================================================
    onSuccess: (data, { sessionId }, context) => {
      // Update invitation cache with server response (preserves messageConfirmedAt)
      queryClient.setQueryData<SessionInvitationResponse>(
        sessionKeys.sessionInvitation(sessionId),
        (old) => {
          if (!old) return { invitation: data.invitation as SessionInvitationResponse['invitation'] };
          return {
            ...old,
            invitation: {
              ...old.invitation,
              ...data.invitation,
            },
          };
        }
      );

      // Update session state, merging invitation data (avoids race conditions)
      // IMPORTANT: Get current state FIRST, then decide whether to update.
      // Using setQueryData with an updater that returns undefined would clear the cache!
      let existingState = queryClient.getQueryData<SessionStateResponse>(sessionKeys.state(sessionId));

      // If cache was cleared, use context from onMutate as fallback
      // This preserves the optimistic update even when something else cleared the cache
      if (!existingState && context?.previousSessionState) {
        // The context.previousSessionState is from BEFORE onMutate's optimistic update
        // We need to apply the optimistic changes + server response
        existingState = {
          ...context.previousSessionState,
          invitation: context.previousSessionState.invitation ? {
            ...context.previousSessionState.invitation,
            messageConfirmed: true,
            messageConfirmedAt: data.invitation.messageConfirmedAt || context.optimisticTimestamp,
          } : context.previousSessionState.invitation,
        };
      }

      if (!existingState) {
        // No cache and no context - this shouldn't happen but handle gracefully
        console.error('[confirmInvitation:onSuccess] No existing session state AND no context - forcing refetch');
        queryClient.invalidateQueries({ queryKey: sessionKeys.state(sessionId) });
      } else {
        // Build the new state, updating stage if advanced
        const newInvitation = existingState.invitation ? {
          ...existingState.invitation,
          messageConfirmed: data.invitation.messageConfirmed,
          messageConfirmedAt: data.invitation.messageConfirmedAt || existingState.invitation.messageConfirmedAt,
        } : existingState.invitation;

        // Update progress.myProgress.stage if advanced
        const newProgress = data.advancedToStage !== undefined
          ? {
              ...existingState.progress,
              myProgress: {
                ...existingState.progress.myProgress,
                stage: data.advancedToStage,
                status: 'IN_PROGRESS', // Stage advances to in-progress
              },
            }
          : existingState.progress;

        // Update session.currentStage and session.myProgress for consistency
        const newSession = data.advancedToStage !== undefined
          ? {
              ...existingState.session,
              currentStage: data.advancedToStage,
              stageStatus: StageStatus.IN_PROGRESS,
              myProgress: {
                ...existingState.session.myProgress,
                stage: data.advancedToStage,
                status: StageStatus.IN_PROGRESS,
              },
            }
          : existingState.session;

        const newState: SessionStateResponse = {
          ...existingState,
          invitation: newInvitation,
          progress: newProgress,
          session: newSession,
        };

        // Set the new state directly (not using updater to avoid undefined issues)
        queryClient.setQueryData(sessionKeys.state(sessionId), newState);
      }

      // Only invalidate detail and progress (less critical, won't affect indicator)
      // These are background refreshes that won't race with the optimistic indicator
      queryClient.invalidateQueries({
        queryKey: sessionKeys.detail(sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: stageKeys.progress(sessionId),
      });

      // NOTE: We do NOT invalidate messages queries here!
      // Instead, we add the transition message directly to the cache below.
      // This prevents refetching all messages and avoids re-animation issues.

      // If we received a transition message, add it to the messages cache
      if (data.transitionMessage && data.advancedToStage === Stage.WITNESS) {
        const transitionMsg = {
          id: data.transitionMessage.id,
          sessionId,
          senderId: null,
          role: MessageRole.AI,
          content: data.transitionMessage.content,
          stage: Stage.WITNESS,
          timestamp: data.transitionMessage.timestamp,
        };

        // Add to the non-stage-filtered message cache (regular query)
        queryClient.setQueryData<{ messages: typeof transitionMsg[]; hasMore: boolean }>(
          messageKeys.list(sessionId),
          (old) => {
            if (!old) return { messages: [transitionMsg], hasMore: false };
            // Append the transition message if not already present
            const exists = old.messages.some(m => m.id === transitionMsg.id);
            if (exists) return old;
            return { ...old, messages: [...old.messages, transitionMsg] };
          }
        );

        // Also add to the infinite query cache (what useUnifiedSession uses)
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.infinite(sessionId),
          (old) => {
            if (!old || old.pages.length === 0) {
              // Create initial structure for infinite query
              return {
                pages: [{ messages: [transitionMsg], hasMore: false }],
                pageParams: [undefined],
              };
            }
            // Append to the first page (newest messages)
            const firstPage = old.pages[0];
            const exists = firstPage.messages.some(m => m.id === transitionMsg.id);
            if (exists) {
              return old;
            }
            const updatedPages = [...old.pages];
            updatedPages[0] = {
              ...firstPage,
              messages: [...firstPage.messages, transitionMsg],
            };
            return { ...old, pages: updatedPages };
          }
        );

        // Also add to the timeline cache (for ChatTimeline component)
        const aiMessageItem: AIMessageItem = {
          type: ChatItemType.AI_MESSAGE,
          id: data.transitionMessage.id,
          timestamp: data.transitionMessage.timestamp,
          content: data.transitionMessage.content,
          status: AIMessageStatus.SENT,
        };

        queryClient.setQueryData<InfiniteData<TimelineResponse, string | undefined>>(
          timelineKeys.infinite(sessionId),
          (oldData): InfiniteData<TimelineResponse, string | undefined> | undefined => {
            if (!oldData || oldData.pages.length === 0) {
              return {
                pages: [{ items: [aiMessageItem], hasMore: false }],
                pageParams: [undefined],
              };
            }

            // Check if message already exists
            const exists = oldData.pages.some(page =>
              page.items.some(item => item.id === aiMessageItem.id)
            );
            if (exists) return oldData;

            // Add to first page
            const newPages = oldData.pages.map((page, index) => {
              if (index === 0) {
                return {
                  ...page,
                  items: [aiMessageItem, ...page.items],
                };
              }
              return page;
            });

            return { ...oldData, pages: newPages };
          }
        );
      }

      // FINAL DEBUG: Log cache state at the very end of onSuccess
      const finalState = queryClient.getQueryData<SessionStateResponse>(sessionKeys.state(sessionId));
      console.log('[confirmInvitation:onSuccess] === COMPLETED SUCCESS HANDLER ===');
      console.log('[confirmInvitation:onSuccess] FINAL cache state:', {
        hasState: !!finalState,
        hasInvitation: !!finalState?.invitation,
        messageConfirmedAt: finalState?.invitation?.messageConfirmedAt,
        stage: finalState?.progress?.myProgress?.stage,
      });
    },

    // =========================================================================
    // ERROR: Rollback to previous cache state
    // =========================================================================
    onError: (_error, { sessionId }, context) => {
      if (context) {
        if (context.previousSessionState !== undefined) {
          queryClient.setQueryData(sessionKeys.state(sessionId), context.previousSessionState);
        }
        if (context.previousInvitation !== undefined) {
          queryClient.setQueryData(sessionKeys.sessionInvitation(sessionId), context.previousInvitation);
        }
        if (context.previousTimeline !== undefined) {
          queryClient.setQueryData(timelineKeys.infinite(sessionId), context.previousTimeline);
        }
      }
    },

    ...options,
  });
}

// ============================================================================
// Archive Session Hook
// ============================================================================

/**
 * Archive a session (for resolved, abandoned, or pending sessions).
 * @deprecated Use useDeleteSession instead for proper data cleanup
 */
export function useArchiveSession(
  options?: Omit<
    UseMutationOptions<
      { archived: boolean; archivedAt: string },
      ApiClientError,
      { sessionId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return post<{ archived: boolean; archivedAt: string }>(
        `/sessions/${sessionId}/archive`
      );
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate session lists to remove the archived session
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      // Invalidate the specific session detail
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Delete Session Hook
// ============================================================================

interface DeleteSessionSummary {
  sessionAbandoned: boolean;
  partnerNotified: boolean;
  dataRecordsDeleted: number;
}

/**
 * Delete a session for the current user.
 *
 * This removes the user's data from the session but leaves the session
 * available for the partner. The partner keeps access to their own data
 * and any content that was shared.
 *
 * For active sessions, the partner is notified that the session was abandoned.
 */
export function useDeleteSession(
  options?: Omit<
    UseMutationOptions<
      { deleted: boolean; summary: DeleteSessionSummary },
      ApiClientError,
      { sessionId: string }
    >,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      return del<{ deleted: boolean; summary: DeleteSessionSummary }>(
        `/sessions/${sessionId}`
      );
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate session lists to remove the deleted session
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      // Remove the specific session detail from cache
      queryClient.removeQueries({ queryKey: sessionKeys.detail(sessionId) });
      // Remove session state from cache
      queryClient.removeQueries({ queryKey: sessionKeys.state(sessionId) });
    },
    ...options,
  });
}

// ============================================================================
// Consolidated Session State Hook
// ============================================================================

/**
 * Fetch consolidated session state in a single request.
 *
 * Returns core session data (session, progress, messages, invitation, compact)
 * in one API call for efficient initial load.
 *
 * Also hydrates individual query caches so subsequent hook calls get cache hits.
 *
 * @param sessionId - The session ID to fetch
 * @param options - React Query options
 */
export function useSessionState(
  sessionId: string | undefined,
  options?: Omit<
    UseQueryOptions<SessionStateResponse, ApiClientError>,
    'queryKey' | 'queryFn'
  >
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: sessionKeys.state(sessionId || ''),
    queryFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      const data = await get<SessionStateResponse>(`/sessions/${sessionId}/state`);

      // Hydrate individual query caches from consolidated response
      // This ensures subsequent hook calls get cache hits
      queryClient.setQueryData(sessionKeys.detail(sessionId), {
        session: data.session,
      });

      queryClient.setQueryData(stageKeys.progress(sessionId), data.progress);

      // Hydrate messages as infinite query format
      queryClient.setQueryData(messageKeys.list(sessionId), {
        pages: [data.messages],
        pageParams: [undefined],
      });

      if (data.invitation) {
        queryClient.setQueryData(sessionKeys.sessionInvitation(sessionId), {
          invitation: data.invitation,
        });
      }

      queryClient.setQueryData(stageKeys.compact(sessionId), data.compact);

      return data;
    },
    enabled: !!sessionId,
    staleTime: 30_000,
    ...options,
  });

  return query;
}

// ============================================================================
// Mark Session Viewed Hook
// ============================================================================

interface MarkSessionViewedResponse {
  success: boolean;
  lastViewedAt: string;
  lastSeenChatItemId: string | null;
}

/**
 * Mark a session as viewed by the current user.
 *
 * This updates the lastViewedAt timestamp and optionally the lastSeenChatItemId.
 * Used to clear unread indicators (blue dot, badge count) when user opens a session.
 *
 * @param sessionId - The session ID (required for automatic call on mount)
 */
export function useMarkSessionViewed(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ lastSeenChatItemId }: { lastSeenChatItemId?: string }) => {
      if (!sessionId) throw new Error('Session ID is required');
      return post<MarkSessionViewedResponse>(`/sessions/${sessionId}/viewed`, {
        lastSeenChatItemId,
      });
    },
    onSuccess: (data) => {
      // Invalidate sessions list to update hasUnread flags
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      // Invalidate unread count for tab badge
      queryClient.invalidateQueries({ queryKey: sessionKeys.unreadCount() });
      // Update session state directly instead of invalidating to avoid race conditions
      // with other mutations (like confirmInvitation) that use optimistic updates.
      // Only update lastSeenChatItemId which is what markViewed actually changes.
      queryClient.setQueryData<SessionStateResponse>(
        sessionKeys.state(sessionId || ''),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            session: {
              ...old.session,
              lastSeenChatItemId: data.lastSeenChatItemId,
            },
          };
        }
      );
    },
  });
}

interface MarkShareTabViewedResponse {
  success: boolean;
  lastViewedShareTabAt: string;
}

/**
 * Mark the Share tab as viewed by the current user.
 *
 * This updates the lastViewedShareTabAt timestamp for the user's session vessel.
 * Used to determine "seen" delivery status for shared content (empathy, context).
 * Content is only marked as "seen" when the user actually views the Share tab,
 * not just when they're on the AI chat tab.
 *
 * @param sessionId - The session ID
 */
export function useMarkShareTabViewed(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('Session ID is required');
      return post<MarkShareTabViewedResponse>(`/sessions/${sessionId}/share-tab-viewed`, {});
    },
    onSuccess: () => {
      // Invalidate empathy status to update delivery statuses
      queryClient.invalidateQueries({ queryKey: stageKeys.empathyStatus(sessionId || '') });
      // Invalidate pending actions (unread context count changed)
      queryClient.invalidateQueries({ queryKey: stageKeys.pendingActions(sessionId || '') });
      // Invalidate aggregate badge count
      queryClient.invalidateQueries({ queryKey: notificationKeys.badgeCount() });
    },
  });
}
