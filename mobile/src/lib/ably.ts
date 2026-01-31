/**
 * Singleton Ably Client for Meet Without Fear Mobile
 *
 * This module provides a singleton Ably client that exists outside of React's
 * component lifecycle. This ensures the connection survives Fast Refresh/Live
 * Reload during development and prevents orphaned connections.
 *
 * Usage:
 * - Import `getAblyClient()` to get the singleton client instance
 * - Import `disconnectAbly()` to disconnect (e.g., on logout)
 * - Manage channel subscriptions in useEffect with proper cleanup
 */

import Ably from 'ably';
import { get, getAuthToken, isE2EAuthMode } from './api';

// ============================================================================
// Types
// ============================================================================

interface AblyTokenResponse {
  tokenRequest: Ably.TokenRequest;
}

// ============================================================================
// Singleton State
// ============================================================================

let ablyClient: Ably.Realtime | null = null;
let connectionPromise: Promise<Ably.Realtime> | null = null;

// ============================================================================
// Token Fetch
// ============================================================================

/**
 * Fetch an Ably token from the backend.
 * This is used by the Ably client's authCallback.
 * Returns either a TokenDetails (preferred) or TokenRequest (legacy).
 */
async function fetchAblyToken(): Promise<Ably.TokenDetails | Ably.TokenRequest> {
  console.log('[AblySingleton] Fetching token...');
  const response = await get<AblyTokenResponse>('/auth/ably-token');

  // Prefer token (actual JWT) over tokenRequest to avoid extra round-trip
  if (response.token) {
    console.log('[AblySingleton] Token received (JWT), clientId:', response.token.clientId);
    return response.token as Ably.TokenDetails;
  }

  // Fallback to tokenRequest for backwards compatibility
  if (response.tokenRequest) {
    console.log('[AblySingleton] TokenRequest received, clientId:', response.tokenRequest.clientId);
    return response.tokenRequest as Ably.TokenRequest;
  }

  throw new Error('Invalid response: neither token nor tokenRequest provided');
}

// ============================================================================
// Singleton Management
// ============================================================================

/**
 * Get or create the singleton Ably client.
 * Returns a promise that resolves to the connected client.
 *
 * This function is safe to call multiple times - it will return the same
 * client instance or wait for the connection to complete.
 */
export async function getAblyClient(): Promise<Ably.Realtime> {
  // Return existing client if connected
  if (ablyClient && ablyClient.connection.state === 'connected') {
    return ablyClient;
  }

  // Return existing client even if in other states (connecting, suspended, etc.)
  // The client will handle reconnection internally
  if (ablyClient && ablyClient.connection.state !== 'failed' && ablyClient.connection.state !== 'closed') {
    return ablyClient;
  }

  // If we're already connecting, wait for that promise
  if (connectionPromise) {
    return connectionPromise;
  }

  // Check if user is authenticated (either via token or E2E headers)
  const token = await getAuthToken();
  if (!token && !isE2EAuthMode()) {
    throw new Error('User not authenticated - cannot connect to Ably');
  }

  // Start new connection
  connectionPromise = createAblyClient();

  try {
    const client = await connectionPromise;
    return client;
  } finally {
    connectionPromise = null;
  }
}

/**
 * Create a new Ably client instance.
 * This is called internally by getAblyClient when needed.
 */
async function createAblyClient(): Promise<Ably.Realtime> {
  console.log('[AblySingleton] Creating new client...');

  // Clean up existing client if any
  if (ablyClient) {
    try {
      ablyClient.connection.off();
      ablyClient.close();
    } catch (e) {
      console.warn('[AblySingleton] Error cleaning up old client:', e);
    }
    ablyClient = null;
  }

  const client = new Ably.Realtime({
    authCallback: async (_, callback) => {
      try {
        const tokenRequest = await fetchAblyToken();
        callback(null, tokenRequest);
      } catch (err) {
        console.error('[AblySingleton] Token fetch error:', err);
        callback(err instanceof Error ? err.message : 'Token fetch failed', null);
      }
    },
    autoConnect: true,
    // Enable auto-recovery
    disconnectedRetryTimeout: 5000,
    suspendedRetryTimeout: 10000,
    // Custom log handler to filter out capability errors we handle gracefully
    // Level: 1=error, 2=major, 3=minor, 4=micro (trace)
    logHandler: (msg: string, level: number) => {
      const lowerMsg = msg.toLowerCase();
      // Filter out channel capability/access denied errors - we handle these with token refresh
      const isCapabilityError =
        lowerMsg.includes('channel denied access') ||
        lowerMsg.includes('capability') ||
        (lowerMsg.includes('channel state') && lowerMsg.includes('failed'));

      if (isCapabilityError) {
        // Always log as info since we handle this gracefully with token refresh
        console.log('[Ably]', msg);
        return;
      }

      // Use appropriate log level for other messages
      if (level === 1) {
        console.error('[Ably]', msg);
      } else if (level === 2) {
        console.warn('[Ably]', msg);
      } else {
        console.log('[Ably]', msg);
      }
    },
  });

  // Set up connection state logging
  client.connection.on((stateChange) => {
    console.log(
      '[AblySingleton] Connection state:',
      stateChange.current,
      stateChange.reason?.message || ''
    );
  });

  ablyClient = client;

  // Wait for initial connection
  return new Promise((resolve, reject) => {
    const onConnected = () => {
      client.connection.off('connected', onConnected);
      client.connection.off('failed', onFailed);
      resolve(client);
    };

    const onFailed = (stateChange: Ably.ConnectionStateChange) => {
      client.connection.off('connected', onConnected);
      client.connection.off('failed', onFailed);
      reject(new Error(stateChange.reason?.message || 'Ably connection failed'));
    };

    // Check if already connected
    if (client.connection.state === 'connected') {
      resolve(client);
      return;
    }

    client.connection.on('connected', onConnected);
    client.connection.on('failed', onFailed);

    // Timeout after 30 seconds
    setTimeout(() => {
      client.connection.off('connected', onConnected);
      client.connection.off('failed', onFailed);
      if (client.connection.state !== 'connected') {
        reject(new Error('Ably connection timeout'));
      }
    }, 30000);
  });
}

/**
 * Get the current Ably client without waiting for connection.
 * Returns null if no client exists.
 */
export function getAblyClientSync(): Ably.Realtime | null {
  return ablyClient;
}

/**
 * Check if the Ably client is currently connected.
 */
export function isAblyConnected(): boolean {
  return ablyClient?.connection.state === 'connected';
}

/**
 * Force reconnect the Ably client.
 * Useful for recovering from broken connections during development.
 */
export async function reconnectAbly(): Promise<void> {
  console.log('[AblySingleton] Force reconnect requested');

  if (ablyClient) {
    // First try using Ably's built-in reconnect
    if (ablyClient.connection.state === 'disconnected' ||
        ablyClient.connection.state === 'suspended' ||
        ablyClient.connection.state === 'failed') {
      console.log('[AblySingleton] Calling connect() on existing client');
      ablyClient.connect();
      return;
    }

    // If in a weird state, recreate the client
    if (ablyClient.connection.state !== 'connected' &&
        ablyClient.connection.state !== 'connecting') {
      console.log('[AblySingleton] Recreating client due to unknown state:', ablyClient.connection.state);
      await getAblyClient();
    }
  } else {
    // No client exists, create one
    await getAblyClient();
  }
}

/**
 * Disconnect and clean up the Ably client.
 * Call this on user logout.
 */
export function disconnectAbly(): void {
  console.log('[AblySingleton] Disconnecting...');

  if (ablyClient) {
    try {
      ablyClient.connection.off();
      ablyClient.close();
    } catch (e) {
      console.warn('[AblySingleton] Error disconnecting:', e);
    }
    ablyClient = null;
  }

  connectionPromise = null;
}

/**
 * Get the current connection state.
 */
export function getAblyConnectionState(): string {
  return ablyClient?.connection.state || 'closed';
}

/**
 * Force refresh the Ably token to get updated capabilities.
 * Call this after creating a new session to ensure the token includes
 * the new session's channel in its capabilities.
 *
 * This uses Ably's auth.authorize() which forces the authCallback to be
 * called again, fetching a fresh token from the backend.
 */
export async function refreshAblyToken(): Promise<void> {
  console.log('[AblySingleton] Refreshing token...');

  if (!ablyClient) {
    console.log('[AblySingleton] No client exists, nothing to refresh');
    return;
  }

  try {
    // auth.authorize() forces Ably to get a new token via authCallback
    // This will call fetchAblyToken() which gets a fresh token from the backend
    // with updated capabilities including any new sessions
    await ablyClient.auth.authorize();
    console.log('[AblySingleton] Token refreshed successfully');
  } catch (err) {
    console.error('[AblySingleton] Token refresh failed:', err);
    throw err;
  }
}
