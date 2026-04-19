/**
 * Web shim for @sentry/react-native.
 * Provides no-op implementations so the app bundles and runs on web
 * without pulling in React Native-specific Sentry code.
 *
 * If `EXPO_PUBLIC_SENTRY_DSN_WEB` (or `EXPO_PUBLIC_SENTRY_DSN`) is set we
 * remember it so `captureException` can annotate the console log for
 * traceability. Sending real events to Sentry from web requires
 * `@sentry/browser`; that's deferred — not in v1 scope.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

let dsn: string | null = null;

export function init(options?: Record<string, unknown>): void {
  const explicit = typeof options?.dsn === 'string' ? (options.dsn as string) : null;
  const webDsn =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_DSN_WEB) ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_DSN) ||
    null;
  dsn = explicit || webDsn;
  if (dsn && typeof console !== 'undefined' && console.info) {
    console.info('[Sentry Web Shim] init — DSN configured but browser transport is not wired (no-op)');
  }
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
  const tag = dsn ? '[Sentry Web Shim — DSN set]' : '[Sentry Web Shim]';
  console.error(tag, error);
}

export function captureMessage(message: string): void {
  const tag = dsn ? '[Sentry Web Shim — DSN set]' : '[Sentry Web Shim]';
  console.warn(tag, message);
}

export function setUser(_user: Record<string, unknown> | null): void {
  // no-op
}
