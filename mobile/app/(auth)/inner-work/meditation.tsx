/**
 * Meditation Route
 *
 * Guided and unguided meditation practice.
 */

import { useRouter, Stack } from 'expo-router';
import { MeditationScreen } from '@/src/screens';

export default function MeditationRoute() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MeditationScreen
        onNavigateBack={() => router.back()}
      />
    </>
  );
}
