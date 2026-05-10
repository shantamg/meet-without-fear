/**
 * Clerk Authentication Flow
 *
 * Contains all Clerk-dependent components. Only import this file in non-E2E mode.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { ClerkProvider, ClerkLoaded, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';

import { AuthContext } from '../hooks/useAuthTypes';
import { useAuthProviderClerk } from '../hooks/useAuthProviderClerk';
import { QueryProvider } from './QueryProvider';
import { setTokenProvider } from '../lib/api';

export const WEB_AUTH_SESSION_MARKER_KEY = 'mwf.auth.hasLocalSession';

interface ClerkAuthFlowProps {
  publishableKey: string;
  children: React.ReactNode;
  onReady?: () => void;
}

/**
 * Clerk auth setup - configures API client token provider
 */
function ClerkAuthSetup() {
  const { getToken, signOut } = useClerkAuth();

  useEffect(() => {
    setTokenProvider({
      getToken: async (options) => getToken({ skipCache: options?.forceRefresh }),
      signOut,
    });
  }, [getToken, signOut]);

  return null;
}

function readWebSessionMarker(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(WEB_AUTH_SESSION_MARKER_KEY) === '1';
  } catch {
    return true;
  }
}

function writeWebSessionMarker(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WEB_AUTH_SESSION_MARKER_KEY, '1');
  } catch {
    // If storage is unavailable, don't block auth. This guard is specifically
    // for the normal browser storage-cleared case.
  }
}

function clearWebSessionMarker(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WEB_AUTH_SESSION_MARKER_KEY);
  } catch {
    // ignore
  }
}

function hasExistingClerkAppStorage(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('__clerk_') || key === '__client') {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * On web, Clerk can recover a signed-in session from its own browser/client
 * state after first-party app storage has been cleared. For this app, clearing
 * site data should mean "this browser is no longer trusted for MWF", so require
 * a first-party marker that is created only by our successful callback flow.
 */
function WebAuthPersistenceGuard() {
  const { isLoaded, isSignedIn, signOut } = useClerkAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web' || !isLoaded) return;

    if (!isSignedIn) {
      clearWebSessionMarker();
      return;
    }

    if (pathname === '/sso-callback') {
      writeWebSessionMarker();
      return;
    }

    if (readWebSessionMarker()) return;

    // One-time migration for users who signed in before this marker existed.
    // If app-origin Clerk storage is still present, this is an ordinary
    // pre-existing session. If site data was cleared, these keys are gone and
    // a recovered Clerk cookie/session should not be accepted silently.
    if (hasExistingClerkAppStorage()) {
      writeWebSessionMarker();
      return;
    }

    signOut({ redirectUrl: undefined })
      .catch((error) => {
        console.warn('[Auth] Failed to clear recovered Clerk session:', error);
      })
      .finally(() => {
        router.replace('/(public)');
      });
  }, [isLoaded, isSignedIn, pathname, router, signOut]);

  return null;
}

/**
 * Auth provider wrapper using Clerk
 */
function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const auth = useAuthProviderClerk();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Complete Clerk authentication flow component
 */
export function ClerkAuthFlow({ publishableKey, children, onReady }: ClerkAuthFlowProps) {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        {onReady && <OnReadyCallback onReady={onReady} />}
        <ClerkAuthSetup />
        <WebAuthPersistenceGuard />
        <QueryProvider>
          <AuthProviderWrapper>
            {children}
          </AuthProviderWrapper>
        </QueryProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

function OnReadyCallback({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}
