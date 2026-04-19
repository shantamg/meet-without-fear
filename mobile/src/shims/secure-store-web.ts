/**
 * Web shim for `expo-secure-store`.
 *
 * `expo-secure-store` relies on platform keystores (Keychain / Keystore) that
 * don't exist in a browser, so the native module crashes at import time if
 * anything pulls it in on web.
 *
 * The hooks that use SecureStore on native (`useBiometricAuth`) already have
 * `.web.ts` siblings that short-circuit before any import happens, but there
 * is still dead code (`src/contexts/AuthContext.tsx`) that imports it at the
 * module top level. This shim is a belt-and-braces guard via a Metro
 * resolver rule so any stray web import degrades to a no-op cache instead
 * of a hard crash.
 *
 * `getItemAsync` returns `null` (unknown key), writes/deletes are silent
 * no-ops. That mirrors the native API surface closely enough for callers
 * that only persist opt-in flags.
 */

export async function getItemAsync(_key: string): Promise<string | null> {
  return null;
}

export async function setItemAsync(_key: string, _value: string): Promise<void> {
  // no-op on web
}

export async function deleteItemAsync(_key: string): Promise<void> {
  // no-op on web
}

export async function isAvailableAsync(): Promise<boolean> {
  return false;
}

// Options objects the native API accepts — re-export the type shape as
// empty records so downstream TS imports keep resolving.
export interface SecureStoreOptions {
  keychainService?: string;
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
}
