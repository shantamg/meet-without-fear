/**
 * Clerk Authentication Flow
 *
 * Contains all Clerk-dependent components. Only import this file in non-E2E mode.
 */

import { useEffect } from 'react';
import { ClerkProvider, ClerkLoaded, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';

import { AuthContext } from '../hooks/useAuthTypes';
import { useAuthProviderClerk } from '../hooks/useAuthProviderClerk';
import { QueryProvider } from './QueryProvider';
import { setTokenProvider } from '../lib/api';

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
