/**
 * Self-Reflection Layout
 *
 * Stack navigator for Self-Reflection screens.
 * - New sessions: fade transition, content appears after fade completes
 * - Existing sessions: normal slide transition
 * - Back navigation: standard swipe gesture
 */

import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function SelfReflectionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerStyle: {
          backgroundColor: colors.bgSecondary,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          color: colors.textPrimary,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: colors.bgPrimary,
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
