/**
 * Inner Work Hub Route
 *
 * Landing page for the Inner Work hub: shows the Inner Thoughts session list.
 */

import { useRouter } from 'expo-router';
import { InnerWorkHubScreen } from '@/src/screens';

export default function InnerWorkHubRoute() {
  const router = useRouter();

  return (
    <InnerWorkHubScreen
      onNavigateToSelfReflection={() => router.push('/inner-work/self-reflection')}
      onBack={() => router.back()}
    />
  );
}
