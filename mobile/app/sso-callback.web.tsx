/**
 * Web-only SSO callback route.
 *
 * When a user completes OAuth via `signIn.authenticateWithRedirect` in
 * app/(public)/auth-options.web.tsx, Clerk redirects the browser back to
 * this origin at `/sso-callback`. On mount we call
 * `clerk.handleRedirectCallback()`, which reads the query/fragment Clerk
 * attached, creates the session, and navigates to `redirectUrlComplete`.
 *
 * This route exists on web only (`.web.tsx`); native never hits it because
 * the native auth flow uses `useOAuth()` with an in-app browser that
 * returns control to the RN navigator directly.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/clerk-expo';

import { colors } from '@/theme';

export default function SsoCallbackScreen() {
  const clerk = useClerk();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clerk || started.current) return;
    started.current = true;

    (async () => {
      try {
        await clerk.handleRedirectCallback({
          redirectUrl: '/sso-callback',
          afterSignInUrl: '/',
          afterSignUpUrl: '/',
        });
        // handleRedirectCallback typically triggers navigation on its own.
        // Belt-and-braces: if we're still here 200ms later, route manually.
        setTimeout(() => router.replace('/'), 200);
      } catch (err) {
        console.error('[sso-callback] handleRedirectCallback failed:', err);
        const message =
          (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ||
          (err as Error)?.message ||
          'Failed to complete sign-in.';
        setError(message);
      }
    })();
  }, [clerk, router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Sign-in failed</Text>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => router.replace('/(public)/auth-options')}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.textPrimary} size="large" />
      <Text style={styles.text}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bgSecondary,
  },
  retryText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
});
