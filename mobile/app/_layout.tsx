import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';

import { APP_MAX_WIDTH, AppearanceProvider, useAppAppearance } from '@/src/theme';
import { SessionDrawerProvider } from '@/src/hooks/useSessionDrawer';
import { useInvitationLink } from '@/src/hooks/useInvitation';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { ToastProvider } from '@/src/contexts/ToastContext';
import { MixpanelInitializer } from '@/src/components/MixpanelInitializer';
import { NativeAppBanner } from '@/src/components/NativeAppBanner';
import { E2EAuthProvider, isE2EMode } from '@/src/providers/E2EAuthProvider';
import { useOTAUpdate } from '@/src/hooks/useOTAUpdate';

/** Keys that may contain user names / PII — strip from Sentry context. */
const PII_KEYS = new Set([
  'name', 'firstName', 'guesser', 'subject',
  'guesserName', 'subjectName', 'partnerName',
  'userName', 'userAName', 'userBName',
]);

function stripPiiFromRecord(data: Record<string, unknown>): void {
  for (const key of Object.keys(data)) {
    if (PII_KEYS.has(key)) {
      delete data[key];
    }
  }
}

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  enabled: !__DEV__,
  beforeSend(event) {
    if (event.extra) {
      stripPiiFromRecord(event.extra as Record<string, unknown>);
    }
    if (event.breadcrumbs) {
      for (const breadcrumb of event.breadcrumbs) {
        if (breadcrumb.data) {
          stripPiiFromRecord(breadcrumb.data);
        }
      }
    }
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data) {
      stripPiiFromRecord(breadcrumb.data);
    }
    return breadcrumb;
  },
});

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Web: kill the default browser focus ring on every focusable element.
// RN Web maps TextInput/Pressable/etc. to <input>/<textarea>/<div> which
// inherit the user agent's blue outline on :focus. We don't use focus rings
// anywhere in the app's design.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const STYLE_ID = 'mwf-no-focus-outline';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      *:focus, *:focus-visible {
        outline: none !important;
        box-shadow: none !important;
      }
      input, textarea, [contenteditable] {
        outline: none !important;
        box-shadow: none !important;
      }
      [aria-modal="true"] {
        align-items: center !important;
      }
      [aria-modal="true"] > div {
        width: 100% !important;
        max-width: ${APP_MAX_WIDTH}px !important;
        height: 100% !important;
        margin-left: auto !important;
        margin-right: auto !important;
        position: relative !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  const FONT_LINK_ID = 'mwf-design-fonts';
  if (!document.getElementById(FONT_LINK_ID)) {
    const preconnectFonts = document.createElement('link');
    preconnectFonts.rel = 'preconnect';
    preconnectFonts.href = 'https://fonts.gstatic.com';
    preconnectFonts.crossOrigin = 'anonymous';
    document.head.appendChild(preconnectFonts);

    const fontLink = document.createElement('link');
    fontLink.id = FONT_LINK_ID;
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap';
    document.head.appendChild(fontLink);
  }
}

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
  const { palette, scheme } = useAppAppearance();

  return (
    <View style={[styles.webBackdrop, { backgroundColor: palette.bg }]}>
      <View style={[styles.webFrame, { backgroundColor: palette.bg }]}>
        <NativeAppBanner />
        <GestureHandlerRootView style={[styles.container, { backgroundColor: palette.bg }]}>
          <SafeAreaProvider>
            <SessionDrawerProvider>
              <ToastProvider>
                {includeMixpanel && <MixpanelInitializer />}
                <Stack
                  screenOptions={{
                    headerShown: false,
                    gestureEnabled: false,
                    contentStyle: { backgroundColor: palette.bg },
                  }}
                >
                  <Stack.Screen name="(public)" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="+not-found" options={{ headerShown: true }} />
                </Stack>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
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

  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif: require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    InstrumentSerifItalic: require('../assets/fonts/InstrumentSerif-Italic.ttf'),
  });

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
          <AppearanceProvider>
            <AppShell includeMixpanel={false} />
          </AppearanceProvider>
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
      <AppearanceProvider>
        <AppShell />
      </AppearanceProvider>
    </ClerkAuthFlow>
  );
}

export default Sentry.wrap(RootLayout);

// Phone-width shim for web: cap the app at a mobile column, center it, and
// paint the viewport gutters with the app's deep page color so the browser's
// default white doesn't bleed through. No-op on native.
const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    ...Platform.select({
      web: {
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
        maxWidth: APP_MAX_WIDTH,
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
    ...Platform.select({
      web: {
        // Establish a positioning context so Expo Router's absolutely-positioned
        // Stack screens anchor here instead of webFrame, keeping the
        // NativeAppBanner visible above them.
        position: 'relative' as const,
      },
      default: {},
    }),
  },
});
