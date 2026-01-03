import { useEffect, useState } from 'react';
import { Stack, Redirect, router } from 'expo-router';
import { useAuth as useClerkAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/theme';
import { useAcceptInvitation } from '@/src/hooks/useSessions';

const PENDING_INVITATION_KEY = 'pending_invitation';

/**
 * Auth group layout
 * Uses Clerk as the single source of truth for authentication.
 * If Clerk says signed in, we're in. No double-checking with backend.
 * Also handles pending invitations that were stored before login.
 */
export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const [checkingInvitation, setCheckingInvitation] = useState(true);

  const acceptInvitation = useAcceptInvitation({
    onSuccess: async (data) => {
      // Clear the pending invitation
      await AsyncStorage.removeItem(PENDING_INVITATION_KEY);
      // Navigate to the accepted session
      router.replace(`/session/${data.session.id}`);
    },
    onError: async () => {
      // Clear the pending invitation on error too (don't get stuck)
      await AsyncStorage.removeItem(PENDING_INVITATION_KEY);
      setCheckingInvitation(false);
    },
  });

  // Check for pending invitation after auth is loaded
  useEffect(() => {
    const checkPendingInvitation = async () => {
      if (!isLoaded || !isSignedIn) {
        setCheckingInvitation(false);
        return;
      }

      try {
        const pendingInvitationId = await AsyncStorage.getItem(PENDING_INVITATION_KEY);
        if (pendingInvitationId) {
          // Accept the pending invitation
          acceptInvitation.mutate({ invitationId: pendingInvitationId });
          return; // Don't set checkingInvitation to false - mutation will handle navigation
        }
      } catch (error) {
        console.error('[AuthLayout] Error checking pending invitation:', error);
      }

      setCheckingInvitation(false);
    };

    checkPendingInvitation();
  }, [isLoaded, isSignedIn]);

  // Wait for Clerk to initialize
  if (!isLoaded) {
    return null;
  }

  // If Clerk says not signed in, redirect to public
  if (!isSignedIn) {
    return <Redirect href="/(public)" />;
  }

  // Wait while checking/processing pending invitation
  if (checkingInvitation || acceptInvitation.isPending) {
    return null;
  }

  // Render the app - backend profile sync happens in useAuth hook
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

      {/* Notifications */}
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: true,
          title: 'Notifications',
        }}
      />
    </Stack>
  );
}
