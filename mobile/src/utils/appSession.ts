/**
 * App session management for tracking user flows across foreground/background cycles
 *
 * An app session starts when:
 * - App launches for the first time
 * - App returns to foreground after being backgrounded
 *
 * Session ID is included in all tracked events as a super property
 */

import { AppState, AppStateStatus } from 'react-native';
import { registerSuperProperties } from '../services/mixpanel';

// Simple UUID generator that doesn't require external dependencies
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let currentSessionId: string | null = null;
let sessionStartTime: number | null = null;
let isInitialized = false;

/**
 * Start a new app session
 */
function startNewSession(): void {
  currentSessionId = generateUUID();
  sessionStartTime = Date.now();

  // Update Mixpanel super properties with new session ID
  registerSuperProperties({
    app_session_id: currentSessionId,
    session_start: new Date(sessionStartTime).toISOString(),
  });

  console.log('[AppSession] New session started:', currentSessionId);
}

/**
 * Get current app session ID
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/**
 * Get session duration in seconds
 */
export function getSessionDuration(): number {
  if (!sessionStartTime) return 0;
  return Math.floor((Date.now() - sessionStartTime) / 1000);
}

/**
 * Initialize app session tracking
 * Should be called once at app launch
 */
export function initializeAppSession(): () => void {
  if (isInitialized) {
    console.log('[AppSession] Already initialized');
    return () => {};
  }

  // Start initial session
  startNewSession();

  // Listen for app state changes
  const subscription = AppState.addEventListener(
    'change',
    (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground - start new session
        console.log('[AppSession] App became active, starting new session');
        startNewSession();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App went to background - log session end
        const duration = getSessionDuration();
        console.log(`[AppSession] Session ended after ${duration}s`);
      }
    }
  );

  isInitialized = true;

  // Return cleanup function
  return () => {
    subscription.remove();
    isInitialized = false;
  };
}

/**
 * Manually end current session and start a new one
 * Useful for significant app events (e.g., logout)
 */
export function refreshSession(): void {
  if (!isInitialized) {
    console.warn('[AppSession] Not initialized, call initializeAppSession() first');
    return;
  }

  const previousDuration = getSessionDuration();
  console.log(`[AppSession] Manually refreshing session (previous: ${previousDuration}s)`);

  startNewSession();
}
