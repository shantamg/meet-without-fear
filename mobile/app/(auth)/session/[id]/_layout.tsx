import { Stack } from 'expo-router';
import { useAppAppearance } from '@/src/theme';

/**
 * Session detail layout
 *
 * Simplified layout for the unified chat-centric session interface.
 * The UnifiedSessionScreen handles all stage transitions internally.
 */
export default function SessionLayout() {
  const { palette } = useAppAppearance();

  return (
    <Stack
      screenOptions={{
        headerShown: false, // UnifiedSessionScreen has its own header
        gestureEnabled: true,
        contentStyle: {
          backgroundColor: palette.bg,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Session',
        }}
      />
      <Stack.Screen
        name="sharing-status"
        options={{
          title: 'Sharing Status',
          headerShown: true,
          headerStyle: {
            backgroundColor: palette.bg,
          },
          headerTintColor: palette.text,
          headerTitleStyle: {
            color: palette.text,
            fontWeight: '600',
          },
          headerBackTitle: 'Chat',
          presentation: 'card',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="tending-checkin"
        options={{
          title: 'Tending check-in',
          headerShown: true,
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text, fontWeight: '600' },
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
