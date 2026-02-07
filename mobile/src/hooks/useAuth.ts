/**
 * Auth Hooks - Clerk-free exports
 *
 * This file re-exports auth types and hooks that don't require Clerk.
 * For Clerk-dependent functionality (useAuthProvider), import from useAuthProviderClerk.ts
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patch, ApiClientError } from '../lib/api';

// Re-export types and context from useAuthTypes (Clerk-free module)
export { AuthContext, useAuth } from './useAuthTypes';
export type { User, AuthContextValue } from './useAuthTypes';

// Re-export useAuthProvider from the Clerk-specific module for backwards compatibility
// NOTE: This import will load Clerk, so avoid importing useAuthProvider in E2E mode
export { useAuthProviderClerk as useAuthProvider } from './useAuthProviderClerk';

// ============================================================================
// Query Keys
// ============================================================================

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

// ============================================================================
// Update Mood Hook
// ============================================================================

interface UpdateMoodResponse {
  lastMoodIntensity: number;
}

interface UpdateMoodRequest {
  intensity: number;
}

/**
 * Update the user's default mood intensity.
 * This is called from the session entry mood check to persist the preference.
 */
export function useUpdateMood() {
  const queryClient = useQueryClient();

  return useMutation<UpdateMoodResponse, ApiClientError, UpdateMoodRequest>({
    mutationFn: async ({ intensity }) => {
      return patch<UpdateMoodResponse>('/auth/me/mood', { intensity });
    },
    onSuccess: () => {
      // Invalidate user data to refetch lastMoodIntensity
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}
