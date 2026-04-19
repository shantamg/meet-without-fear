/**
 * Web stub for useBiometricAuth.
 * Biometrics are not available on web — returns disabled state so
 * BiometricPrompt never renders.
 */

export type { BiometricAuthState, BiometricAuthActions, UseBiometricAuthReturn } from './useBiometricAuth';

export function useBiometricAuth() {
  return {
    // State
    isAvailable: false,
    isEnrolled: false,
    isEnabled: false,
    isLoading: false,
    biometricType: null as null,
    biometricName: null as null,
    hasPrompted: true, // pretend already prompted so opt-in never shows
    error: null as string | null,
    // Actions
    checkAvailability: async () => false,
    authenticate: async () => false,
    enableBiometric: async () => false,
    disableBiometric: async () => {},
    markPrompted: async () => {},
    refresh: async () => {},
  };
}
