/**
 * Inner Work Layout
 *
 * Stack navigator for Inner Work screens including:
 * - Hub (main landing)
 * - Self-Reflection (chat sessions)
 * - Needs Assessment
 * - Gratitude Practice
 * - Meditation
 */

import { Stack } from 'expo-router';
import { useAppAppearance } from '@/src/theme';

export default function InnerWorkLayout() {
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
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="self-reflection"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="needs"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="gratitude"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="meditation"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
