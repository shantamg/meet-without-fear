/**
 * Web shim for `@clerk/clerk-expo/token-cache`.
 *
 * The native Clerk Expo token cache is backed by `expo-secure-store`, which
 * cannot run in a browser. Clerk web sessions don't actually need a custom
 * cache (Clerk's web SDK manages its own cookie session), but `ClerkProvider`
 * still accepts a `tokenCache` prop on the Expo variant. We satisfy the API
 * surface with a `localStorage`-backed cache so the same `ClerkAuthFlow`
 * component bundles without changes.
 */

interface TokenCache {
  getToken: (key: string) => Promise<string | null>;
  saveToken: (key: string, token: string) => Promise<void>;
  clearToken?: (key: string) => Promise<void>;
}

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const tokenCache: TokenCache = {
  async getToken(key) {
    if (!isBrowser) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async saveToken(key, token) {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(key, token);
    } catch {
      // ignore quota / privacy-mode errors
    }
  },
  async clearToken(key) {
    if (!isBrowser) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
