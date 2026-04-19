/**
 * Web shim for @sentry/react-native.
 * Provides no-op implementations so the app bundles and runs on web
 * without pulling in React Native-specific Sentry code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

export function init(_options?: Record<string, unknown>): void {
  // no-op on web
}

export function wrap<T>(component: T): T {
  return component;
}

export function addBreadcrumb(_breadcrumb: Record<string, unknown>): void {
  // no-op on web
}

export function captureException(
  error: unknown,
  _context?: Record<string, unknown>,
): void {
  console.error('[Sentry Web Shim]', error);
}

export function captureMessage(message: string): void {
  console.warn('[Sentry Web Shim]', message);
}

export function setUser(_user: Record<string, unknown> | null): void {
  // no-op
}
