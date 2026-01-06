/**
 * Gratitude Practice Route
 *
 * Practice gratitude and notice patterns.
 */

import { useRouter, Stack } from 'expo-router';
import { GratitudeScreen } from '@/src/screens';

export default function GratitudeRoute() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GratitudeScreen
        onNavigateBack={() => router.back()}
      />
    </>
  );
}
