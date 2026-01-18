/**
 * useTimeline Hook
 *
 * React Query hook for fetching and managing the unified chat timeline.
 * Supports infinite scroll pagination and real-time updates via Ably.
 *
 * This hook replaces the previous useInfiniteMessages hook with a unified
 * ChatItem-based approach that includes messages, indicators, and other
 * timeline items.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  InfiniteData,
} from '@tanstack/react-query';
import Ably from 'ably';
import { get } from '../lib/api';
import {
  ChatItem,
  TimelineResponse,
  ChatItemNewPayload,
  ChatItemUpdatePayload,
  ChatItemType,
  AIMessageStatus,
  UserMessageStatus,
  REALTIME_CHANNELS,
} from '@meet-without-fear/shared';
import { timelineKeys } from './queryKeys';
import { getAblyClient } from '../lib/ably';
import { useAuth } from './useAuth';

// ============================================================================
// Types
// ============================================================================

export interface UseTimelineOptions {
  /** Session ID to fetch timeline for */
  sessionId: string;
  /** Number of items to fetch per page (default 20) */
  limit?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseTimelineResult {
  /** All timeline items across all pages, flattened and sorted newest-first */
  items: ChatItem[];
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
  /** Error object if any */
  error: Error | null;
  /** Function to load more (older) items */
  fetchNextPage: () => void;
  /** Whether more items are available */
  hasNextPage: boolean;
  /** Whether loading more items */
  isFetchingNextPage: boolean;
  /** Function to refetch the timeline */
  refetch: () => void;
  /** Add an optimistic item (returns cleanup function) */
  addOptimisticItem: (item: ChatItem) => () => void;
  /** Update an existing item in the cache */
  updateItem: (itemId: string, changes: Partial<Omit<ChatItem, 'type' | 'id'>>) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Fetch and manage the unified chat timeline with infinite scroll.
 *
 * Features:
 * - Infinite scroll pagination with cursor-based loading
 * - Real-time updates via Ably (chat-item:new and chat-item:update events)
 * - Optimistic updates for user-initiated actions
 * - Automatic deduplication by item ID
 */
export function useTimeline(options: UseTimelineOptions): UseTimelineResult {
  const { sessionId, limit = 20, enabled = true } = options;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Track items we've added optimistically to avoid duplicates from server
  const optimisticIdsRef = useRef<Set<string>>(new Set());

  // Track channel and mounted state for cleanup
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const isMountedRef = useRef(true);

  // =========================================================================
  // Query
  // =========================================================================

  const query = useInfiniteQuery({
    queryKey: timelineKeys.infinite(sessionId),
    queryFn: async ({ pageParam }) => {
      const queryParams = new URLSearchParams();
      queryParams.set('limit', limit.toString());

      // For subsequent pages, use 'before' cursor
      if (pageParam) {
        queryParams.set('before', pageParam as string);
      }

      const url = `/sessions/${sessionId}/timeline?${queryParams.toString()}`;
      return get<TimelineResponse>(url);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.items.length === 0) return undefined;
      // Return the oldest item's timestamp as the cursor for the next page
      // Items are sorted newest-first, so oldest is at the end
      const oldestItem = lastPage.items[lastPage.items.length - 1];
      return oldestItem?.timestamp;
    },
    enabled: enabled && !!sessionId,
    staleTime: 60_000, // 1 minute
    gcTime: 300_000, // 5 minutes
    refetchOnMount: 'always', // Always refetch when session opens
  });

  // =========================================================================
  // Flatten and deduplicate items
  // =========================================================================

  const items: ChatItem[] = [];
  const seenIds = new Set<string>();

  if (query.data?.pages) {
    for (const page of query.data.pages) {
      for (const item of page.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          items.push(item);
        }
      }
    }
  }

  // =========================================================================
  // Optimistic Updates
  // =========================================================================

  /**
   * Add an optimistic item to the timeline.
   * Returns a cleanup function to remove it (on error).
   */
  const addOptimisticItem = useCallback(
    (item: ChatItem): (() => void) => {
      // Track this as optimistic so we can dedupe when server responds
      optimisticIdsRef.current.add(item.id);

      queryClient.setQueryData<InfiniteData<TimelineResponse, string | undefined>>(
        timelineKeys.infinite(sessionId),
        (oldData): InfiniteData<TimelineResponse, string | undefined> => {
          if (!oldData) {
            // No data yet, create initial structure
            return {
              pages: [{ items: [item], hasMore: false }],
              pageParams: [undefined],
            };
          }

          // Add to the first page (newest items)
          const newPages: TimelineResponse[] = oldData.pages.map((page, index) => {
            if (index === 0) {
              return {
                ...page,
                items: [item, ...page.items],
              };
            }
            return page;
          });

          return { ...oldData, pages: newPages };
        }
      );

      // Return cleanup function
      return () => {
        optimisticIdsRef.current.delete(item.id);
        queryClient.setQueryData<InfiniteData<TimelineResponse, string | undefined>>(
          timelineKeys.infinite(sessionId),
          (oldData): InfiniteData<TimelineResponse, string | undefined> | undefined => {
            if (!oldData) return oldData;

            const newPages: TimelineResponse[] = oldData.pages.map((page) => ({
              ...page,
              items: page.items.filter((i) => i.id !== item.id),
            }));

            return { ...oldData, pages: newPages };
          }
        );
      };
    },
    [sessionId, queryClient]
  );

  /**
   * Update an existing item in the cache.
   */
  const updateItem = useCallback(
    (itemId: string, changes: Partial<Omit<ChatItem, 'type' | 'id'>>) => {
      queryClient.setQueryData<InfiniteData<TimelineResponse, string | undefined>>(
        timelineKeys.infinite(sessionId),
        (oldData): InfiniteData<TimelineResponse, string | undefined> | undefined => {
          if (!oldData) return oldData;

          const newPages: TimelineResponse[] = oldData.pages.map((page) => ({
            ...page,
            items: page.items.map((item): ChatItem =>
              item.id === itemId ? ({ ...item, ...changes } as ChatItem) : item
            ),
          }));

          return { ...oldData, pages: newPages };
        }
      );
    },
    [sessionId, queryClient]
  );

  // =========================================================================
  // Ably Real-time Subscriptions
  // =========================================================================

  useEffect(() => {
    if (!sessionId || !enabled || !user?.id) return;

    let isCleanedUp = false;
    let channel: Ably.RealtimeChannel | null = null;

    const setupSubscription = async () => {
      try {
        console.log('[useTimeline] Setting up subscription for session:', sessionId);

        const ably = await getAblyClient();

        if (isCleanedUp) return;

        // Get the session channel
        const channelName = REALTIME_CHANNELS.session(sessionId);
        channel = ably.channels.get(channelName);
        channelRef.current = channel;

        // Subscribe to chat-item:new events
        channel.subscribe('chat-item:new', (message: Ably.Message) => {
          if (isCleanedUp || !isMountedRef.current) return;

          const payload = message.data as ChatItemNewPayload;
          const { item, forUserId } = payload;

          // Only handle events for this user (if targeted)
          if (forUserId && forUserId !== user?.id) return;

          // Skip if item is already in our optimistic set (we added it)
          if (optimisticIdsRef.current.has(item.id)) {
            // Remove from optimistic set since server confirmed it
            optimisticIdsRef.current.delete(item.id);
            return;
          }

          // Add to cache
          queryClient.setQueryData<InfiniteData<TimelineResponse, string | undefined>>(
            timelineKeys.infinite(sessionId),
            (oldData): InfiniteData<TimelineResponse, string | undefined> | undefined => {
              if (!oldData) {
                return {
                  pages: [{ items: [item], hasMore: false }],
                  pageParams: [undefined],
                };
              }

              // Check if item already exists (dedupe)
              for (const page of oldData.pages) {
                if (page.items.some((i) => i.id === item.id)) {
                  return oldData; // Already exists, no change
                }
              }

              // Add to first page
              const newPages: TimelineResponse[] = oldData.pages.map((page, index) => {
                if (index === 0) {
                  return {
                    ...page,
                    items: [item, ...page.items],
                  };
                }
                return page;
              });

              return { ...oldData, pages: newPages };
            }
          );
        });

        // Subscribe to chat-item:update events
        channel.subscribe('chat-item:update', (message: Ably.Message) => {
          if (isCleanedUp || !isMountedRef.current) return;

          const payload = message.data as ChatItemUpdatePayload;
          const { id, changes, forUserId } = payload;

          // Only handle events for this user (if targeted)
          if (forUserId && forUserId !== user?.id) return;

          updateItem(id, changes);
        });

        console.log('[useTimeline] Subscription setup complete');
      } catch (err) {
        console.error('[useTimeline] Subscription error:', err);
      }
    };

    setupSubscription();

    // Cleanup function
    return () => {
      console.log('[useTimeline] Cleaning up subscription for session:', sessionId);
      isCleanedUp = true;

      if (channel) {
        try {
          channel.unsubscribe('chat-item:new');
          channel.unsubscribe('chat-item:update');
        } catch (err) {
          console.warn('[useTimeline] Error during channel cleanup:', err);
        }
      }

      channelRef.current = null;
    };
  }, [sessionId, enabled, user?.id, queryClient, updateItem]);

  // =========================================================================
  // Return
  // =========================================================================

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    addOptimisticItem,
    updateItem,
  };
}

// ============================================================================
// Helper: Create Optimistic User Message
// ============================================================================

/**
 * Create an optimistic user message ChatItem for immediate display.
 *
 * @param content - Message content
 * @returns ChatItem with temporary ID and 'sending' status
 */
export function createOptimisticUserMessage(content: string): ChatItem {
  return {
    type: ChatItemType.USER_MESSAGE,
    id: `optimistic-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    timestamp: new Date().toISOString(),
    content,
    status: UserMessageStatus.SENDING,
  };
}

/**
 * Create an optimistic AI message placeholder for streaming.
 *
 * @param id - Message ID from server
 * @returns ChatItem with 'streaming' status
 */
export function createStreamingAIMessage(id: string): ChatItem {
  return {
    type: ChatItemType.AI_MESSAGE,
    id,
    timestamp: new Date().toISOString(),
    content: '',
    status: AIMessageStatus.STREAMING,
  };
}
