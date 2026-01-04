/**
 * useNotifications Hook for Meet Without Fear Mobile
 *
 * Manages notifications with real API integration, infinite scroll,
 * and real-time updates.
 */

import { useState, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '@/src/lib/api';
import { NotificationListResponseDTO } from '@meet-without-fear/shared';
import { NotificationItem } from '@/src/components/NotificationInbox';
import { useAuth } from './useAuth';

// ============================================================================
// Query Keys
// ============================================================================

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
};

// ============================================================================
// API Functions
// ============================================================================

async function fetchNotifications(
  cursor?: string,
  limit = 20
): Promise<NotificationListResponseDTO> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return get<NotificationListResponseDTO>(`/notifications?${params.toString()}`);
}

async function markNotificationRead(notificationId: string): Promise<{ unreadCount: number }> {
  const result = await patch<{ success: boolean; unreadCount: number }>(
    `/notifications/${notificationId}/read`
  );
  return { unreadCount: result.unreadCount };
}

async function markAllNotificationsRead(): Promise<{ markedCount: number }> {
  const result = await patch<{ success: boolean; markedCount: number }>(
    '/notifications/mark-all-read'
  );
  return { markedCount: result.markedCount };
}

// ============================================================================
// Hook
// ============================================================================

export interface UseNotificationsReturn {
  notifications: NotificationItem[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  unreadCount: number;
  refetch: () => Promise<void>;
  loadMore: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Infinite query for notifications list
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchQuery,
  } = useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated,
    staleTime: 30000, // 30 seconds
  });

  // Flatten pages into a single list
  const notifications: NotificationItem[] =
    data?.pages.flatMap((page) => page.notifications) ?? [];

  // Get unread count from the latest page
  const unreadCount = data?.pages[data.pages.length - 1]?.unreadCount ?? 0;

  // Mark single notification as read
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (notificationId) => {
      // Optimistically update the UI
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });

      const previousData = queryClient.getQueryData(notificationKeys.list());

      queryClient.setQueryData<typeof data>(notificationKeys.list(), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            notifications: page.notifications.map((n) =>
              n.id === notificationId ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, page.unreadCount - 1),
          })),
        };
      });

      return { previousData };
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(notificationKeys.list(), context.previousData);
      }
    },
    onSettled: () => {
      // Invalidate unread count
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });

  // Mark all notifications as read
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });

      const previousData = queryClient.getQueryData(notificationKeys.list());

      queryClient.setQueryData<typeof data>(notificationKeys.list(), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            notifications: page.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          })),
        };
      });

      return { previousData };
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(notificationKeys.list(), context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });

  // Refresh handler (pull-to-refresh)
  const refetch = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchQuery();
    } finally {
      setRefreshing(false);
    }
  }, [refetchQuery]);

  // Load more handler (infinite scroll)
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Mark single notification as read
  const markRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id);
    },
    [markReadMutation]
  );

  // Mark all as read
  const markAllRead = useCallback(() => {
    markAllReadMutation.mutate();
  }, [markAllReadMutation]);

  return {
    notifications,
    isLoading,
    isError,
    error: error as Error | null,
    refreshing,
    isLoadingMore: isFetchingNextPage,
    hasMore: !!hasNextPage,
    unreadCount,
    refetch,
    loadMore,
    markRead,
    markAllRead,
  };
}

// ============================================================================
// Unread Count Hook (for badge display)
// ============================================================================

export function useNotificationCount(): {
  unreadCount: number;
  isLoading: boolean;
  refetch: () => void;
} {
  const { isAuthenticated } = useAuth();

  const { data, isLoading, refetch } = useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  const unreadCount = data?.pages[0]?.unreadCount ?? 0;

  return {
    unreadCount,
    isLoading,
    refetch: () => refetch(),
  };
}
