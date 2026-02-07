/**
 * Mock Clerk Expo Module for E2E Testing
 *
 * This file replaces @clerk/clerk-expo when EXPO_PUBLIC_E2E_MODE=true.
 * It provides no-op implementations of all Clerk exports used in the app,
 * preventing the "useAuth can only be used within <ClerkProvider>" error.
 */

import React, { ReactNode } from 'react';

// E2E test user data - matches E2EAuthProvider
const E2E_USER = {
  id: 'e2e-test-user',
  firstName: 'E2E',
  lastName: 'Test',
  fullName: 'E2E Test User',
  emailAddresses: [{ emailAddress: 'e2e-test@e2e.test' }],
  createdAt: new Date(),
};

/**
 * Mock ClerkProvider - just renders children, no context needed
 */
export function ClerkProvider({ children }: { children: ReactNode }) {
  return children as React.ReactElement;
}

/**
 * Mock ClerkLoaded - renders children immediately (always "loaded")
 */
export function ClerkLoaded({ children }: { children: ReactNode }) {
  return children as React.ReactElement;
}

/**
 * Mock SignedIn - renders children (E2E mode is always "signed in")
 */
export function SignedIn({ children }: { children: ReactNode }) {
  return children as React.ReactElement;
}

/**
 * Mock SignedOut - never renders children in E2E mode
 */
export function SignedOut(_props: { children: ReactNode }) {
  return null;
}

/**
 * Mock useAuth hook
 */
export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: E2E_USER.id,
    sessionId: 'e2e-session',
    getToken: async () => null, // E2E mode doesn't use tokens
    signOut: async () => {},
  };
}

/**
 * Mock useUser hook
 */
export function useUser() {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: E2E_USER,
  };
}

/**
 * Mock useClerk hook
 */
export function useClerk() {
  return {
    loaded: true,
    signOut: async () => {},
    openSignIn: () => {},
    openSignUp: () => {},
    openUserProfile: () => {},
    session: null,
    user: E2E_USER,
  };
}

/**
 * Mock useOAuth hook
 */
export function useOAuth() {
  return {
    startOAuthFlow: async () => ({
      createdSessionId: 'e2e-session',
      setActive: async () => {},
    }),
  };
}

/**
 * Mock useSession hook
 */
export function useSession() {
  return {
    isLoaded: true,
    isSignedIn: true,
    session: {
      id: 'e2e-session',
      user: E2E_USER,
    },
  };
}

/**
 * Mock useSignIn hook
 */
export function useSignIn() {
  return {
    isLoaded: true,
    signIn: null,
    setActive: async () => {},
  };
}

/**
 * Mock useSignUp hook
 */
export function useSignUp() {
  return {
    isLoaded: true,
    signUp: null,
    setActive: async () => {},
  };
}
