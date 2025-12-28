import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Compact Screen
 * Stage 0 - Curiosity Compact signing
 *
 * This screen redirects to the onboarding flow which handles
 * the complete Stage 0 experience including welcome message,
 * consent question, and compact signing.
 */
export default function CompactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Redirect to the onboarding screen which handles the full Stage 0 flow
  useEffect(() => {
    router.replace(`/session/${id}/onboarding`);
  }, [id, router]);

  return null;
}
