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
import { colors } from '@/theme';

export default function InnerWorkLayout() {
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
