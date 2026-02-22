import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setAuthTokenResolver } from '../services/api';

/**
 * Connects Clerk's auth token to the API service.
 * Must be rendered inside ClerkProvider.
 */
export function AuthSetup() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenResolver(() => getToken());
  }, [getToken]);

  return null;
}
