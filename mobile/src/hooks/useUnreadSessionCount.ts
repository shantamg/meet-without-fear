/**
 * useUnreadSessionCount Hook
 *
 * Fetches and tracks the count of sessions with unread content.
 * Used for displaying a badge on the Sessions tab icon.
 */

import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/api';
import type { UnreadSessionCountResponse } from '@meet-without-fear/shared';
import { sessionKeys } from './queryKeys';

/**
 * Fetch unread session count from the API
 */
async function fetchUnreadSessionCount(): Promise<number> {
  const response = await api.get<{ data: UnreadSessionCountResponse }>('/sessions/unread-count');
  return response.data.data.count;
}

/**
 * Hook to get the count of sessions with unread content.
 *
 * @returns Object with count and loading/error states
 */
export function useUnreadSessionCount() {
  const { data: count = 0, isLoading, error } = useQuery({
    queryKey: sessionKeys.unreadCount(),
    queryFn: fetchUnreadSessionCount,
    // Refetch every 30 seconds to keep badge up to date
    refetchInterval: 30000,
    // Refetch when window regains focus
    refetchOnWindowFocus: true,
  });

  return {
    count,
    isLoading,
    error,
  };
}
