/**
 * Inner Thoughts Layout
 *
 * Stack navigator for Inner Thoughts screens.
 */

import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function InnerThoughtsLayout() {
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
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false, // Using custom header in the screen
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
