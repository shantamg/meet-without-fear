import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

/**
 * Public routes layout
 * These routes don't require authentication
 * Redirects to home if user is already signed in
 */
export default function PublicLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show nothing while checking auth
  if (!isLoaded) {
    return null;
  }

  // Redirect to home if already signed in
  if (isSignedIn) {
    return <Redirect href="/(auth)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="invitation" />
    </Stack>
  );
}
