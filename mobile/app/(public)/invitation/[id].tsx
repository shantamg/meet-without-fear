import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/src/hooks/useAuth';

const PENDING_INVITATION_KEY = 'pending_invitation';

/**
 * Invitation landing screen
 *
 * When a user opens an invitation deep link, this screen:
 * 1. Stores the invitation ID for later use
 * 2. Redirects to login if not authenticated
 * 3. Redirects to the session if authenticated
 */
export default function InvitationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    const handleInvitation = async () => {
      if (!id) {
        // No invitation ID, go to login
        router.replace('/(public)');
        return;
      }

      // Store the invitation ID
      await AsyncStorage.setItem(PENDING_INVITATION_KEY, id);

      if (isLoading) {
        // Still loading auth state, wait
        return;
      }

      if (isAuthenticated) {
        // User is authenticated, go directly to session
        router.replace(`/session/${id}`);
      } else {
        // User needs to login first
        router.replace('/(public)');
      }
    };

    handleInvitation();
  }, [id, isAuthenticated, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4F46E5" />
      <Text style={styles.text}>Loading invitation...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
});
