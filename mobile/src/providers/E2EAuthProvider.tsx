/**
 * E2E Auth Provider
 *
 * Bypasses Clerk authentication for E2E testing.
 * When EXPO_PUBLIC_E2E_MODE is set, this provider mocks the auth context
 * to simulate a logged-in user without requiring Clerk.
 */

import React, { ReactNode, useCallback, useState } from 'react';
import { AuthContext, User, AuthContextValue } from '../hooks/useAuthTypes';
import { setTokenProvider } from '../lib/api';

// E2E test user - matches what the backend E2E auth bypass expects
const E2E_USER: User = {
  id: 'e2e-test-user',
  email: 'e2e-test@e2e.test',
  name: 'E2E Test User',
  firstName: 'E2E',
  lastName: 'Test',
  biometricEnabled: false,
  lastMoodIntensity: null,
  createdAt: new Date().toISOString(),
};

interface E2EAuthProviderProps {
  children: ReactNode;
}

/**
 * Mock auth provider for E2E testing.
 * Simulates a logged-in user and configures the API client
 * to use E2E auth bypass headers.
 */
export function E2EAuthProvider({ children }: E2EAuthProviderProps) {
  const [user, setUser] = useState<User | null>(E2E_USER);

  // Configure API client to use E2E headers instead of Clerk tokens
  React.useEffect(() => {
    setTokenProvider({
      getToken: async () => null, // No token needed - backend uses E2E headers
      signOut: async () => {
        setUser(null);
      },
      // Custom headers for E2E auth bypass
      e2eHeaders: {
        'x-e2e-user-id': E2E_USER.id,
        'x-e2e-user-email': E2E_USER.email,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
  }, []);

  const getToken = useCallback(async () => {
    return null; // E2E mode doesn't use tokens
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const authValue: AuthContextValue = {
    user,
    isLoading: false,
    isAuthenticated: !!user,
    signOut,
    getToken,
    updateUser,
  };

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Check if E2E mode is enabled
 */
export function isE2EMode(): boolean {
  return process.env.EXPO_PUBLIC_E2E_MODE === 'true';
}
