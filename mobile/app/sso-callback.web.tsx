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
import { useClerk, useSignIn, useSignUp } from '@clerk/clerk-expo';

import { colors } from '@/theme';

// Clerk's hosted sign-up continuation UI. Lives under the Account Portal
// subdomain that ships with every Clerk instance; we don't have to host it.
// When a Google OAuth sign-up completes but Clerk requires a field Google
// didn't supply (phone / username / etc.), Clerk redirects here and the
// Account Portal prompts the user for the remaining field before finalizing
// the session.
const CONTINUE_SIGN_UP_URL = 'https://accounts.meetwithoutfear.com/sign-up/continue';

export default function SsoCallbackScreen() {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
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
          // If the OAuth return leaves a signUp in `missing_requirements`
          // (Clerk instance requires a field Google didn't supply), Clerk
          // will navigate the browser here to collect it. Without this,
          // handleRedirectCallback silently returns with no session and the
          // user gets bounced back to the welcome screen with no explanation.
          continueSignUpUrl: CONTINUE_SIGN_UP_URL,
        });

        // Log the post-callback state so we can see exactly what Clerk did.
        // Useful for debugging when the session doesn't materialize.
        console.log('[sso-callback] post-callback state', {
          clerkSession: !!clerk.session,
          signInStatus: signIn?.status,
          signUpStatus: signUp?.status,
          signUpMissingFields: signUp?.missingFields,
          signUpUnverifiedFields: signUp?.unverifiedFields,
        });

        // Only fall back if we actually have a session — otherwise letting
        // Clerk's own navigation (including continueSignUpUrl) complete.
        if (clerk.session) {
          setTimeout(() => router.replace('/'), 200);
          return;
        }

        // No session and no navigation — surface whatever Clerk knows.
        const missing =
          signUp?.missingFields?.join(', ') ||
          signUp?.unverifiedFields?.join(', ');
        const status = signUp?.status || signIn?.status;
        if (missing) {
          setError(
            `Sign-up couldn't complete: missing ${missing}. If this doesn't finish on its own, check your Clerk dashboard's required fields.`,
          );
        } else if (status) {
          setError(`Sign-in ended in status "${status}" without a session.`);
        } else {
          setError('Sign-in didn\'t complete. Please try again.');
        }
      } catch (err) {
        console.error('[sso-callback] handleRedirectCallback failed:', err);
        const message =
          (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ||
          (err as Error)?.message ||
          'Failed to complete sign-in.';
        setError(message);
      }
    })();
  }, [clerk, router, signIn, signUp]);

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
