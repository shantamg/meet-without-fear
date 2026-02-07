/**
 * Mock Clerk Expo Token Cache for E2E Testing
 *
 * This file replaces @clerk/clerk-expo/token-cache when EXPO_PUBLIC_E2E_MODE=true.
 */

/**
 * Mock tokenCache - no-op implementation
 */
export const tokenCache = {
  getToken: async () => null,
  saveToken: async () => {},
  clearToken: async () => {},
};
