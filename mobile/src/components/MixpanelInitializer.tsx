/**
 * Mixpanel Initializer Component
 *
 * Handles:
 * - Mixpanel SDK initialization on app launch
 * - Identity management (identify/alias) on auth changes
 * - App Launch tracking
 * - Sign In/Up/Logout tracking
 * - Re-identification on app foreground
 */

import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useAuth } from '@clerk/clerk-expo';
import { useUser } from '@clerk/clerk-expo';

import {
  initializeMixpanel,
  identify,
  alias,
  track,
  registerSuperProperties,
  setUserProperties,
  setUserPropertiesOnce,
  reset,
} from '../services/mixpanel';
import { initializeAppSession, getCurrentSessionId } from '../utils/appSession';

const ALIAS_FLAG_PREFIX = '@mixpanel_aliased_';
// Track if a reset() was called this session - if so, skip alias() since
// there are no meaningful anonymous events to merge after a logout/reset
const RESET_FLAG = '@mixpanel_reset_this_session';

export function MixpanelInitializer() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const prevSignedIn = useRef<boolean | null>(null);
  const hasTrackedLaunch = useRef(false);

  // Initialize Mixpanel and app session on mount
  useEffect(() => {
    async function init() {
      await initializeMixpanel();

      // Initialize app session management (handles foreground transitions)
      const cleanup = initializeAppSession();

      // Register super properties
      registerSuperProperties({
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version || 'unknown',
        environment: __DEV__ ? 'dev' : 'prod',
      });

      // Track App Launch (only once per cold start)
      if (!hasTrackedLaunch.current) {
        track('App Launch', {
          platform: Platform.OS,
          app_version: Constants.expoConfig?.version || 'unknown',
        });
        hasTrackedLaunch.current = true;
      }

      return cleanup;
    }

    const cleanupPromise = init();
    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  // Handle auth state changes
  useEffect(() => {
    if (!isLoaded) return;

    async function handleAuthChange() {
      // Sign in transition
      if (isSignedIn && user && prevSignedIn.current === false) {
        const userId = user.id;

        // Check if we need to alias (first time this user on this device)
        const aliasFlag = `${ALIAS_FLAG_PREFIX}${userId}`;
        const hasAliased = await AsyncStorage.getItem(aliasFlag);

        // Check if we just reset() Mixpanel (e.g., after logout)
        // If so, skip alias() since there are no meaningful anonymous events
        // to merge, and the SDK's distinctId may be invalid after reset()
        const wasResetThisSession = await AsyncStorage.getItem(RESET_FLAG);

        if (!hasAliased && !wasResetThisSession) {
          // First-time login: create alias to merge anonymous events
          alias(userId);
          await AsyncStorage.setItem(aliasFlag, 'true');
        }

        // Clear the reset flag now that we've handled the login
        if (wasResetThisSession) {
          await AsyncStorage.removeItem(RESET_FLAG);
        }

        // Identify the user
        identify(userId);

        // Register user_id as super property
        registerSuperProperties({ user_id: userId });

        // Determine provider and if new user
        const provider = user.externalAccounts?.[0]?.provider || 'unknown';
        const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
        const isNewUser = Date.now() - createdAt < 60000; // Created within last minute

        // Track sign in/up
        track(isNewUser ? 'Sign Up Completed' : 'Sign In Completed', {
          method: 'oauth',
          provider,
          user_id: userId,
        });

        // Set user properties
        setUserPropertiesOnce({
          first_seen_at: new Date().toISOString(),
          signup_source: 'mobile',
        });

        setUserProperties({
          name: user.fullName || user.firstName || 'User',
          email: user.emailAddresses?.[0]?.emailAddress,
          last_login_at: new Date().toISOString(),
        });
      }

      // Sign out transition
      if (!isSignedIn && prevSignedIn.current === true) {
        track('Logout');
        reset();
        // Mark that we reset Mixpanel - this prevents alias() errors on next login
        // since the SDK's anonymous distinctId may be invalid after reset()
        await AsyncStorage.setItem(RESET_FLAG, 'true');
      }

      prevSignedIn.current = isSignedIn ?? false;
    }

    handleAuthChange();
  }, [isLoaded, isSignedIn, user]);

  // Re-identify on app foreground (defensive)
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && user?.id) {
        // Re-identify and update session
        identify(user.id);
        registerSuperProperties({
          app_session_id: getCurrentSessionId(),
          user_id: user.id,
        });
      }
    });

    return () => subscription.remove();
  }, [isLoaded, isSignedIn, user]);

  return null;
}
