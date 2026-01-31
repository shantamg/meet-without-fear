/**
 * Clerk-based Auth Provider Hook
 *
 * This file imports Clerk hooks and should ONLY be imported in non-E2E mode.
 * For E2E mode, use E2EAuthProvider which doesn't require Clerk.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { disconnectAbly } from '../lib/ably';
import type { ApiResponse, GetMeResponse } from '@meet-without-fear/shared';
import type { User, AuthContextValue } from './useAuthTypes';

/**
 * Hook to provide authentication state using Clerk
 *
 * Clerk-first approach:
 * - Clerk is the single source of truth for "am I logged in?"
 * - Backend user profile is just data we fetch, not a permission gate
 */
export function useAuthProviderClerk(): AuthContextValue {
  const { isSignedIn, isLoaded, signOut: clerkSignOut, getToken } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const queryClient = useQueryClient();

  const [user, setUser] = useState<User | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Sync backend profile when Clerk auth state changes
  useEffect(() => {
    async function syncBackendProfile() {
      // Not signed in - clear user
      if (!isSignedIn || !clerkUser) {
        setUser(null);
        return;
      }

      // Already have user data - no need to refetch
      if (user?.id) {
        return;
      }

      setIsLoadingProfile(true);
      try {
        const response = await apiClient.get<ApiResponse<GetMeResponse>>('/auth/me');

        if (response.data?.data?.user) {
          const backendUser = response.data.data.user;
          setUser({
            id: backendUser.id,
            email: backendUser.email,
            name: backendUser.name || backendUser.email,
            firstName: backendUser.firstName,
            lastName: backendUser.lastName,
            biometricEnabled: backendUser.biometricEnabled,
            lastMoodIntensity: backendUser.lastMoodIntensity,
            createdAt: backendUser.createdAt,
          });
        }
      } catch (error) {
        console.error('[useAuth] Failed to sync backend profile:', error);
        // Don't block the app - create minimal user from Clerk data
        setUser({
          id: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          name: clerkUser.fullName || clerkUser.firstName || 'User',
          firstName: clerkUser.firstName || null,
          lastName: clerkUser.lastName || null,
          biometricEnabled: false,
          lastMoodIntensity: null,
          createdAt: clerkUser.createdAt?.toISOString() || new Date().toISOString(),
        });
      } finally {
        setIsLoadingProfile(false);
      }
    }

    if (isLoaded) {
      syncBackendProfile();
    }
  }, [isSignedIn, isLoaded, clerkUser?.id]);

  const signOut = useCallback(async () => {
    setUser(null);
    // Clear all React Query cache to prevent stale user data
    // when signing back in with a different account
    queryClient.clear();
    // Disconnect Ably to ensure fresh connection with new token on next login
    disconnectAbly();
    await clerkSignOut();
  }, [clerkSignOut, queryClient]);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  return {
    user,
    isLoading: !isLoaded || isLoadingProfile,
    isAuthenticated: isSignedIn ?? false,
    signOut,
    getToken: getTokenFn,
    updateUser,
  };
}
