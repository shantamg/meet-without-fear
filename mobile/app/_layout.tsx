import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { SessionDrawerProvider } from '@/src/hooks/useSessionDrawer';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { ToastProvider } from '@/src/contexts/ToastContext';
import { MixpanelInitializer } from '@/src/components/MixpanelInitializer';
import { E2EAuthProvider, isE2EMode } from '@/src/providers/E2EAuthProvider';

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
  return (
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
  );
}

/**
 * Root layout component
 */
export default function RootLayout() {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
