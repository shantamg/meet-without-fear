/**
 * Onboarding Screen (Stage 0)
 *
 * The Curiosity Compact signing flow for new sessions.
 * Users must agree to the commitments before proceeding.
 */

import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/src/hooks/useSessions';
import { useCompactStatus } from '@/src/hooks/useStages';
import { CuriosityCompact } from '@/src/components/CuriosityCompact';
import { WaitingRoom } from '@/src/components/WaitingRoom';

// ============================================================================
// Component
// ============================================================================

export default function OnboardingScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: sessionData, refetch: refetchSession } = useSession(sessionId);
  const { data: compactStatus, refetch: refetchCompact } = useCompactStatus(sessionId);

  const handleSigned = () => {
    // Refresh both queries to get updated state
    refetchSession();
    refetchCompact();
    // Navigate back to session detail which will route appropriately
    router.replace(`/session/${sessionId}`);
  };

  const session = sessionData?.session;
  const mySigned = compactStatus?.mySigned ?? false;
  const partnerSigned = compactStatus?.partnerSigned ?? false;

  // If we signed but partner hasn't, show waiting room
  if (mySigned && !partnerSigned) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Waiting',
            headerBackTitle: 'Session',
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <WaitingRoom
            message="Waiting for your partner to sign the Curiosity Compact"
            partnerName={session?.partner?.name ?? undefined}
          />
        </SafeAreaView>
      </>
    );
  }

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
        <CuriosityCompact sessionId={sessionId!} onSign={handleSigned} />
      </SafeAreaView>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
