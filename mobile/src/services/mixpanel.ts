/**
 * Mixpanel Analytics Service for Meet Without Fear Mobile App
 */

import { Mixpanel } from 'mixpanel-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define a common interface for our real and mock clients
// This ensures they both have the same functions.
interface IMixpanel {
  init: () => Promise<void>;
  track: (eventName: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string) => void;
  alias: (alias: string, distinctId?: string) => void;
  getPeople: () => {
    set: (prop: string, to: unknown) => void;
    setOnce: (prop: string, to: unknown) => void;
  };
  registerSuperProperties: (properties: Record<string, unknown>) => void;
  reset: () => void;
}

// The "No-Op" client for non-production environments
// It has the same methods as the real Mixpanel client, but just logs to the console.
const createNoOpClient = (): IMixpanel => {
  const log = (message: string, ...args: unknown[]) => {
    // __DEV__ is a global variable set by React Native in development mode
    if (__DEV__) {
      console.log(`[Mixpanel DEV] ${message}`, ...args);
    }
  };

  return {
    init: async () => log('Initialized (No-Op Mode)'),
    track: (eventName, properties) => log('Track:', eventName, properties ?? {}),
    identify: (userId) => log('Identify:', userId),
    alias: (alias, distinctId) =>
      log('Alias:', alias, `(from_distinct_id: ${distinctId ?? 'CURRENT'})`),
    getPeople: () => ({
      set: (prop, to) => log('Set User Property:', { [prop]: to }),
      setOnce: (prop, to) => log('Set User Property Once:', { [prop]: to }),
    }),
    registerSuperProperties: (properties) => log('Register Super Properties:', properties),
    reset: () => log('Reset'),
  };
};

// This will hold our client, either the real one or the no-op one.
let mixpanelClient: IMixpanel;
let didInit = false;

/**
 * Initialize the Mixpanel client.
 * This should be called once when your app starts.
 */
export const initializeMixpanel = async (): Promise<void> => {
  // Prevent re-initialization
  if (didInit) {
    return;
  }

  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;

  if (token) {
    // Token exists, use the real Mixpanel client
    const realMixpanel = new Mixpanel(token, false, false, {
      getItem: async (key: string) => await AsyncStorage.getItem(key),
      setItem: async (key: string, value: string) => await AsyncStorage.setItem(key, value),
      removeItem: async (key: string) => await AsyncStorage.removeItem(key),
    });
    await realMixpanel.init();
    console.log('[Mixpanel] Initialized with real client');
    mixpanelClient = realMixpanel as unknown as IMixpanel;
  } else {
    // No token, so we're in a non-production env. Use the no-op client.
    mixpanelClient = createNoOpClient();
    await mixpanelClient.init();
  }

  didInit = true;
};

/**
 * Simple track function with dev guard.
 */
const assertInit = (): void => {
  if (__DEV__ && !didInit)
    console.warn('[Mixpanel DEV] track() before initializeMixpanel()');
};

export const track = (eventName: string, properties?: Record<string, unknown>): void => {
  assertInit();
  mixpanelClient?.track(eventName, properties);
};

/**
 * Simple identify function with dev guard.
 * This should be called when a user logs in or when the app loads with a stored user.
 */
export const identify = (userId: string): void => {
  console.log('[Mixpanel] identify() called', {
    userId,
    didInit,
    clientExists: !!mixpanelClient,
    timestamp: new Date().toISOString(),
  });

  assertInit();

  try {
    mixpanelClient?.identify(userId);
    console.log('[Mixpanel] identify() completed successfully for user:', userId);
  } catch (error) {
    console.error('[Mixpanel] identify() failed:', error);
  }
};

/**
 * Alias links an anonymous distinct_id with a user's identifier.
 * This merges all pre-login anonymous events with the user's profile.
 *
 * IMPORTANT: Only call this ONCE per user, typically on first-time login.
 * Mixpanel does not allow multiple alias calls for the same user.
 * The caller should ensure this function is only called once per user.
 *
 * @param aliasId - The user's identifier (e.g., UUID)
 */
export const alias = (aliasId: string): void => {
  assertInit();
  // Pass only the new aliasId.
  // The SDK will automatically merge from the current anonymous distinct_id.
  try {
    mixpanelClient?.alias(aliasId);
    console.log('[Mixpanel] alias() completed for user:', aliasId);
  } catch (error) {
    console.error('[Mixpanel] alias() failed:', error);
  }
};

/**
 * Set user properties.
 * These are updated on each call.
 */
export const setUserProperties = (properties: Record<string, unknown>): void => {
  assertInit();

  try {
    const people = mixpanelClient?.getPeople();
    if (people) {
      Object.entries(properties).forEach(([key, value]) => {
        people.set(key, value);
      });
    }
  } catch (error) {
    console.error('[Mixpanel] setUserProperties() failed:', error);
  }
};

/**
 * Set user properties once (won't override if already set).
 * Use for properties like first_seen_at, install_version, etc.
 */
export const setUserPropertiesOnce = (properties: Record<string, unknown>): void => {
  assertInit();
  try {
    const people = mixpanelClient?.getPeople();
    if (people) {
      Object.entries(properties).forEach(([key, value]) => {
        people.setOnce(key, value);
      });
    }
  } catch (error) {
    console.error('[Mixpanel] setUserPropertiesOnce() failed:', error);
  }
};

/**
 * Register super properties that will be sent with every event.
 * Should be called at app launch with environment, version, platform info.
 */
export const registerSuperProperties = (properties: Record<string, unknown>): void => {
  assertInit();
  mixpanelClient?.registerSuperProperties(properties);
};

/**
 * Reset user data.
 * Call this on logout to clear user identity.
 */
export const reset = (): void => {
  mixpanelClient?.reset();
};

/**
 * Check if Mixpanel has been initialized
 */
export const isInitialized = (): boolean => didInit;
