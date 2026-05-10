/**
 * Self-Reflection Layout
 *
 * Stack navigator for Self-Reflection screens.
 * - New sessions: fade transition, content appears after fade completes
 * - Existing sessions: normal slide transition
 * - Back navigation: standard swipe gesture
 */

import { Stack } from 'expo-router';
import { useAppAppearance } from '@/src/theme';

export default function SelfReflectionLayout() {
  const { palette } = useAppAppearance();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerStyle: {
          backgroundColor: palette.bg,
        },
        headerTintColor: palette.text,
        headerTitleStyle: {
          color: palette.text,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: palette.bg,
        },
        // Allow swipe back gesture
        gestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          headerShown: false,
          // Animation is handled dynamically in the screen
        }}
      />
    </Stack>
  );
}
