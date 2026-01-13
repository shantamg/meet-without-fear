import { Stack } from 'expo-router';
import { colors } from '@/src/theme';

/**
 * Main navigation layout
 *
 * Previously used bottom tabs, now uses Stack navigation.
 * Navigation is handled via:
 * - Hamburger menu (SessionDrawer) for sessions
 * - Gear icon for settings
 * - Home screen is the main landing page
 */
export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.bgPrimary,
        },
      }}
    >
      <Stack.Screen name="index" />
      {/* sessions.tsx is kept for direct navigation but not accessible via tabs */}
      <Stack.Screen
        name="sessions"
        options={{
          headerShown: true,
          headerTitle: 'My Sessions',
          headerStyle: {
            backgroundColor: colors.bgSecondary,
          },
          headerTintColor: colors.textPrimary,
        }}
      />
    </Stack>
  );
}
