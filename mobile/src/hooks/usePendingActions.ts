/**
 * usePendingActions Hook
 *
 * Fetches pending action items and badge counts for the activity menu.
 * Refetches on window focus and on Ably notification events.
 */

import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { stageKeys, notificationKeys } from './queryKeys';

// ============================================================================
// Types
// ============================================================================

export interface PendingAction {
  type: 'share_offer' | 'validate_empathy' | 'context_received';
  id: string;
  data: Record<string, unknown>;
}

interface PendingActionsResponse {
  actions: PendingAction[];
  sentTabUpdates?: number;
}

interface BadgeCountResponse {
  count: number;
  bySession: Record<string, number>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch pending actions for a specific session.
 */
export function usePendingActions(sessionId: string | undefined) {
  return useQuery<PendingActionsResponse>({
    queryKey: stageKeys.pendingActions(sessionId!),
    queryFn: () => get<PendingActionsResponse>(`/sessions/${sessionId}/pending-actions`),
    enabled: !!sessionId,
    refetchOnWindowFocus: true,
    staleTime: 30_000, // 30s - badge events trigger invalidation for freshness
  });
}

/**
 * Fetch aggregate badge count across all active sessions.
 */
export function useBadgeCount() {
  return useQuery<BadgeCountResponse>({
    queryKey: notificationKeys.badgeCount(),
    queryFn: () => get<BadgeCountResponse>('/notifications/badge-count'),
    refetchOnWindowFocus: true,
    staleTime: 60_000, // 1min
  });
}
