import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CuriosityCompact } from '@/src/components/CuriosityCompact';
import { WaitingRoom } from '@/src/components/WaitingRoom';
import { useCompactStatus, useSignCompact } from '@/src/hooks/useStages';

/**
 * Compact Screen
 * Stage 0 - Curiosity Compact signing
 *
 * Users must review and sign the Curiosity Compact before proceeding.
 * Both users must sign before advancing to the chat stage.
 */
export default function CompactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: compactStatus, isLoading } = useCompactStatus(id);
  const { mutate: signCompact, isPending } = useSignCompact();

  // Navigate to chat when both have signed
  useEffect(() => {
    if (compactStatus?.canAdvance) {
      router.replace(`/session/${id}/chat`);
    }
  }, [compactStatus?.canAdvance, id, router]);

  const handleSign = () => {
    signCompact(
      { sessionId: id! },
      {
        onSuccess: (response) => {
          if (response.canAdvance) {
            router.replace(`/session/${id}/chat`);
          }
        },
      }
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Curiosity Compact',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // User has signed but partner has not - show waiting room
  if (compactStatus?.mySigned && !compactStatus?.partnerSigned) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Curiosity Compact',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <WaitingRoom
            message="You've signed the Curiosity Compact. Waiting for your partner to sign the compact before you can begin."
          />
        </SafeAreaView>
      </>
    );
  }

  // User has not signed - show compact
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Curiosity Compact',
          headerBackTitle: 'Session',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <CuriosityCompact sessionId={id!} onSign={handleSign} />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
});
