import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { colors } from '@/theme';

/**
 * Auth group layout
 * Redirects to login if user is not authenticated
 */
export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show nothing while checking auth
  if (!isLoaded) {
    return null;
  }

  // Redirect to welcome screen if not authenticated
  if (!isSignedIn) {
    return <Redirect href="/(public)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: colors.bgPrimary,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          color: colors.textPrimary,
        },
        contentStyle: {
          backgroundColor: colors.bgPrimary,
        },
      }}
    >
      {/* Tabs are the main navigation */}
      <Stack.Screen name="(tabs)" />

      {/* Session flow screens */}
      <Stack.Screen
        name="session/new"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'New Session',
        }}
      />
      <Stack.Screen name="session/[id]" />

      {/* Person detail */}
      <Stack.Screen
        name="person/[id]"
        options={{
          headerShown: true,
          title: 'Person',
        }}
      />
    </Stack>
  );
}
