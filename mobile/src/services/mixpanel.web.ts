/**
 * Web implementation of the Mixpanel analytics service.
 *
 * Mirrors the surface of `./mixpanel` (native) so call sites in `analytics.ts`
 * and elsewhere remain platform-agnostic. Metro picks this file for web targets.
 *
 * No token → falls back to a console-logging no-op (matches native behavior).
 */

import mixpanel from 'mixpanel-browser';

let didInit = false;
let hasToken = false;
let identifiedUserId: string | null = null;

const log = (message: string, ...args: unknown[]): void => {
  if (__DEV__) {
    console.log(`[Mixpanel Web] ${message}`, ...args);
  }
};

export const initializeMixpanel = async (): Promise<void> => {
  if (didInit) return;

  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;

  if (token) {
    mixpanel.init(token, {
      debug: __DEV__,
      track_pageview: false,
      persistence: 'localStorage',
    });
    hasToken = true;
    console.log('[Mixpanel Web] Initialized with real client');
  } else {
    log('Initialized (No-Op Mode — no EXPO_PUBLIC_MIXPANEL_TOKEN)');
  }

  didInit = true;
};

const assertInit = (): void => {
  if (__DEV__ && !didInit) {
    console.warn('[Mixpanel Web] called before initializeMixpanel()');
  }
};

export const track = (eventName: string, properties?: Record<string, unknown>): void => {
  assertInit();
  if (!hasToken) {
    log('Track:', eventName, properties ?? {});
    return;
  }
  mixpanel.track(eventName, properties);
};

export const identify = (userId: string): void => {
  assertInit();
  if (identifiedUserId === userId) return;
  identifiedUserId = userId;
  if (!hasToken) {
    log('Identify:', userId);
    return;
  }
  try {
    mixpanel.identify(userId);
  } catch (error) {
    console.error('[Mixpanel Web] identify() failed:', error);
  }
};

export const alias = (aliasId: string): void => {
  assertInit();
  if (!hasToken) {
    log('Alias:', aliasId);
    return;
  }
  try {
    mixpanel.alias(aliasId);
  } catch (error) {
    console.error('[Mixpanel Web] alias() failed:', error);
  }
};

export const setUserProperties = (properties: Record<string, unknown>): void => {
  assertInit();
  if (!hasToken) {
    log('Set User Properties:', properties);
    return;
  }
  try {
    mixpanel.people.set(properties);
  } catch (error) {
    console.error('[Mixpanel Web] setUserProperties() failed:', error);
  }
};

export const setUserPropertiesOnce = (properties: Record<string, unknown>): void => {
  assertInit();
  if (!hasToken) {
    log('Set User Properties Once:', properties);
    return;
  }
  try {
    mixpanel.people.set_once(properties);
  } catch (error) {
    console.error('[Mixpanel Web] setUserPropertiesOnce() failed:', error);
  }
};

export const registerSuperProperties = (properties: Record<string, unknown>): void => {
  assertInit();
  if (!hasToken) {
    log('Register Super Properties:', properties);
    return;
  }
  mixpanel.register(properties);
};

export const reset = (): void => {
  identifiedUserId = null;
  if (!hasToken) {
    log('Reset');
    return;
  }
  mixpanel.reset();
};

export const isInitialized = (): boolean => didInit;
