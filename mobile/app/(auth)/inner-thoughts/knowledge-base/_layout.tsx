/**
 * Knowledge Base Layout
 *
 * Nested Stack navigator for knowledge base sub-screens.
 * Follows the same pattern as the parent inner-thoughts/_layout.tsx.
 */

import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function KnowledgeBaseLayout() {
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
        name="[topic]"
        options={{
          headerShown: false, // Using custom header in the screen
        }}
      />
    </Stack>
  );
}
