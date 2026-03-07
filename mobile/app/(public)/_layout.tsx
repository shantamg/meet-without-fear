import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { colors } from '@/theme';

/**
 * Public routes layout
 * These routes don't require authentication
 * Redirects to home if user is already signed in,
 * EXCEPT for invitation routes (which handle their own acceptance flow)
 */
export default function PublicLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const pathname = usePathname();

  // Show nothing while checking auth
  if (!isLoaded) {
    return null;
  }

  // Allow invitation routes for authenticated users — the invitation screen
  // auto-accepts and navigates to the session when the user is signed in
  const isInvitationRoute = pathname.startsWith('/invitation');

  // Redirect to home if already signed in (but not on invitation routes)
  if (isSignedIn && !isInvitationRoute) {
    return <Redirect href="/(auth)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="auth-options" />
      <Stack.Screen name="invitation" />
    </Stack>
  );
}
