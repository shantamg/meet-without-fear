/**
 * Web stub for Mixpanel analytics.
 * Uses console logging in dev; no-op in production.
 * Can be replaced with mixpanel-browser SDK later for real web analytics.
 */

let didInit = false;
let identifiedUserId: string | null = null;

const log = (message: string, ...args: unknown[]) => {
  if (__DEV__) {
    console.log(`[Mixpanel Web] ${message}`, ...args);
  }
};

export const initializeMixpanel = async (): Promise<void> => {
  if (didInit) return;
  log('Initialized (web no-op)');
  didInit = true;
};

export const track = (eventName: string, properties?: Record<string, unknown>): void => {
  log('Track:', eventName, properties ?? {});
};

export const identify = (userId: string): void => {
  if (identifiedUserId === userId) return;
  log('Identify:', userId);
  identifiedUserId = userId;
};

export const alias = (aliasId: string): void => {
  log('Alias:', aliasId);
};

export const setUserProperties = (properties: Record<string, unknown>): void => {
  log('Set User Properties:', properties);
};

export const setUserPropertiesOnce = (properties: Record<string, unknown>): void => {
  log('Set User Properties Once:', properties);
};

export const registerSuperProperties = (properties: Record<string, unknown>): void => {
  log('Register Super Properties:', properties);
};

export const reset = (): void => {
  log('Reset');
  identifiedUserId = null;
};

export const isInitialized = (): boolean => didInit;
