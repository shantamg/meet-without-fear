/**
 * Needs Assessment Route
 *
 * Check in with your 19 core human needs.
 */

import { useRouter, Stack } from 'expo-router';
import { NeedsAssessmentScreen } from '@/src/screens';

export default function NeedsAssessmentRoute() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <NeedsAssessmentScreen
        onNavigateBack={() => router.back()}
      />
    </>
  );
}
