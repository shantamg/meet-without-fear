import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';

import { theme } from '@/src/theme';
import { SessionDrawerProvider } from '@/src/hooks/useSessionDrawer';
import { useInvitationLink } from '@/src/hooks/useInvitation';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { ToastProvider } from '@/src/contexts/ToastContext';
import { MixpanelInitializer } from '@/src/components/MixpanelInitializer';
import { NativeAppBanner } from '@/src/components/NativeAppBanner';
import { E2EAuthProvider, isE2EMode } from '@/src/providers/E2EAuthProvider';
import { useOTAUpdate } from '@/src/hooks/useOTAUpdate';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  tracesSampleRate: 1.0,
  enabled: !__DEV__,
});

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

/**
 * Component to hide splash screen once ready
 */
function HideSplashOnReady() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

/**
 * Common app shell - UI container shared between Clerk and E2E modes
 */
function AppShell({ includeMixpanel = true }: { includeMixpanel?: boolean }) {
  // Capture invitation deep links to AsyncStorage (backup for home screen pickup)
  useInvitationLink();

  return (
    <View style={styles.webBackdrop}>
      <View style={styles.webFrame}>
        <NativeAppBanner />
        <GestureHandlerRootView style={styles.container}>
          <SafeAreaProvider>
            <SessionDrawerProvider>
              <ToastProvider>
                {includeMixpanel && <MixpanelInitializer />}
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(public)" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="+not-found" options={{ headerShown: true }} />
                </Stack>
                <StatusBar style="light" />
              </ToastProvider>
            </SessionDrawerProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </View>
    </View>
  );
}

/**
 * Root layout component
 */
function RootLayout() {
  // Check for OTA updates at root level so it runs even on the sign-in screen.
  // Without this, users stuck on a broken sign-in can never receive the fix via OTA.
  useOTAUpdate();

  const [fontsLoaded, fontError] = useFonts({});

  // Keep showing splash screen until fonts are loaded
  if (!fontsLoaded && !fontError) {
    return null;
  }

  // E2E mode: bypass Clerk entirely
  if (isE2EMode()) {
    return (
      <QueryProvider>
        <E2EAuthProvider>
          <HideSplashOnReady />
          <AppShell includeMixpanel={false} />
        </E2EAuthProvider>
      </QueryProvider>
    );
  }

  // Normal mode: use Clerk (imported dynamically to avoid loading in E2E mode)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ClerkAuthFlow } = require('@/src/providers/ClerkAuthFlow');

  return (
    <ClerkAuthFlow
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || ''}
      onReady={() => SplashScreen.hideAsync()}
    >
      <AppShell />
    </ClerkAuthFlow>
  );
}

export default Sentry.wrap(RootLayout);

// Phone-width shim for web: cap the app at a mobile column, center it, and
// paint the viewport gutters with the app's deep page color so the browser's
// default white doesn't bleed through. No-op on native.
const MOBILE_MAX_WIDTH = 480;

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    ...Platform.select({
      web: {
        backgroundColor: theme.colors.bgPage,
        alignItems: 'center',
      },
      default: {},
    }),
  },
  webFrame: {
    flex: 1,
    ...Platform.select({
      web: {
        width: '100%',
        maxWidth: MOBILE_MAX_WIDTH,
        // Establish a positioning context and clip overflow so absolutely-positioned
        // descendants (Expo Router's Stack screens, the session drawer) anchor to the
        // column's edges instead of the viewport.
        position: 'relative',
        overflow: 'hidden',
      },
      default: {},
    }),
  },
  container: {
    flex: 1,
  },
});
