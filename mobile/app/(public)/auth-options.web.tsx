/**
 * Web-only auth options screen.
 *
 * The native version (auth-options.tsx) uses `useOAuth()` which on web falls
 * back to a popup-based flow. That popup pattern silently fails for many
 * browsers/extensions (COOP blocking `popup.closed`, popup blockers, stale
 * postMessage), so new users click "Continue with Google", complete the
 * OAuth flow in the popup, and get dumped back on the sign-in screen with
 * no session. Existing users hit a faster path in Clerk that doesn't need
 * the popup handshake, which is why the bug looked account-specific.
 *
 * This web override swaps the popup flow for Clerk's full-page redirect
 * flow (`signIn.authenticateWithRedirect`) — the same pattern the marketing
 * site's `@clerk/nextjs` <SignIn/> component was using before the web app
 * moved to the Expo Web bundle. The browser navigates to Google, back to
 * Clerk, and finally to `/sso-callback` on our origin, where
 * `useClerk().handleRedirectCallback()` finalizes the session.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { AntDesign } from '@expo/vector-icons';
import { colors } from '@/theme';

type OAuthStrategy = 'oauth_google' | 'oauth_apple';

export default function AuthOptionsScreenWeb() {
  const { isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const clerk = useClerk();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<OAuthStrategy | null>(null);

  const loaded = signInLoaded && signUpLoaded;

  const handleOAuthRedirect = async (strategy: OAuthStrategy, provider: string) => {
    if (!loaded || !signUp || busyProvider) return;
    setError(null);
    setBusyProvider(strategy);

    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';

      // If a stale Clerk session cookie is still present (common on mobile
      // browsers that kept a session from earlier testing), Clerk
      // short-circuits authenticateWithRedirect server-side and the flow
      // never reaches Google — so `oidcPrompt` has nothing to apply to and
      // the user just silently lands back signed in with no chooser. Sign
      // any existing session out first so OAuth always starts fresh.
      if (clerk?.session) {
        try {
          await clerk.signOut({ redirectUrl: undefined });
        } catch (signOutErr) {
          console.warn('[auth-options.web] signOut before OAuth failed (non-fatal):', signOutErr);
        }
      }

      // Use the signUp resource as the OAuth entrypoint rather than signIn.
      // Clerk's signUp auto-transfers back to signIn for existing users, so
      // both first-time and returning users are handled. Going the other
      // direction (signIn → signUp) has been observed to stall in
      // `needs_identifier` for new users on this @clerk/clerk-expo / RN-web
      // combination — the auto-transfer to signUp doesn't fire and the
      // signIn resource just returns in its initial state with no session.
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: `${origin}/sso-callback`,
        redirectUrlComplete: `${origin}/`,
        // Force a full, fresh OAuth screen. `select_account` alone showed
        // the picker on desktop but Google appeared to skip it in some
        // mobile browser contexts. `consent` is more forceful — Google
        // re-shows the whole consent flow, which includes the account
        // chooser. Space-separated is valid OIDC for multiple prompts.
        oidcPrompt: 'select_account consent',
      });
      // The browser navigates away. Anything below this line only runs if
      // the redirect was blocked somehow.
    } catch (err) {
      console.error(`[auth-options.web] OAuth redirect error (${provider}):`, err);
      const message =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ||
        (err as Error)?.message ||
        `Failed to continue with ${provider}`;
      setError(message);
      setBusyProvider(null);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} accessibilityLabel="Go back">
          <AntDesign name="left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Sign in or create an account to continue</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <OAuthButton
          iconName="google"
          label="Continue with Google"
          onPress={() => handleOAuthRedirect('oauth_google', 'Google')}
          busy={busyProvider === 'oauth_google'}
          disabled={!loaded || !!busyProvider}
        />
        <OAuthButton
          // AntDesign types don't include 'apple1' even though the glyph
          // exists — matches the cast in auth-options.tsx.
          iconName={'apple1' as React.ComponentProps<typeof AntDesign>['name']}
          label="Continue with Apple"
          onPress={() => handleOAuthRedirect('oauth_apple', 'Apple')}
          busy={busyProvider === 'oauth_apple'}
          disabled={!loaded || !!busyProvider}
        />
      </View>
    </SafeAreaView>
  );
}

function OAuthButton({
  iconName,
  label,
  onPress,
  busy,
  disabled,
}: {
  iconName: React.ComponentProps<typeof AntDesign>['name'];
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.oauthButton, disabled && styles.oauthButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textPrimary} style={styles.buttonIcon} />
      ) : (
        <AntDesign name={iconName} size={20} color={colors.textPrimary} style={styles.buttonIcon} />
      )}
      <Text style={styles.oauthButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 16,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  oauthButton: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  oauthButtonDisabled: {
    opacity: 0.5,
  },
  oauthButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  buttonIcon: {
    marginRight: 8,
  },
});
