import { Stack } from 'expo-router';
import { colors } from '@/src/theme';

/**
 * Session detail layout
 *
 * Simplified layout for the unified chat-centric session interface.
 * The UnifiedSessionScreen handles all stage transitions internally.
 */
export default function SessionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // UnifiedSessionScreen has its own header
        contentStyle: {
          backgroundColor: colors.bgPrimary,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Session',
        }}
      />
    </Stack>
  );
}
