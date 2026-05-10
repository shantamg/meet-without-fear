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
      onStartNewSession={() => router.push('/inner-work/self-reflection/new')}
      onOpenSession={(sessionId) => router.push(`/inner-work/self-reflection/${sessionId}`)}
      onBack={() => router.replace('/(auth)/(tabs)')}
    />
  );
}
