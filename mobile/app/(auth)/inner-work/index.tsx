/**
 * Inner Work Hub Route
 *
 * Main landing page for all Inner Work features:
 * - Self-Reflection (formerly Inner Thoughts)
 * - Needs Assessment
 * - Gratitude Practice
 * - Meditation
 */

import { useRouter } from 'expo-router';
import { InnerWorkHubScreen } from '@/src/screens';

export default function InnerWorkHubRoute() {
  const router = useRouter();

  return (
    <InnerWorkHubScreen
      onNavigateToSelfReflection={() => router.push('/inner-work/self-reflection')}
      onNavigateToNeedsAssessment={() => router.push('/inner-work/needs')}
      onNavigateToGratitude={() => router.push('/inner-work/gratitude')}
      onNavigateToMeditation={() => router.push('/inner-work/meditation')}
      onBack={() => router.back()}
    />
  );
}
