import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useCallback } from 'react';
import { UnifiedSessionScreen } from '@/src/screens/UnifiedSessionScreen';
import { useLinkedInnerThoughts } from '@/src/hooks';
import { Stage } from '@meet-without-fear/shared';

/**
 * Unified Session Screen
 *
 * Single chat-centric interface that handles all session stages.
 * No more separate screens per stage - everything flows through the chat.
 * Includes Inner Thoughts button for private reflection linked to this session.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Check if there's already a linked Inner Thoughts session
  const { data: linkedData } = useLinkedInnerThoughts(id);

  const handleNavigateBack = () => {
    router.back();
  };

  const handleNavigateToInnerThoughts = useCallback(() => {
    if (!id) return;

    // If there's already a linked session, navigate to it
    if (linkedData?.innerThoughtsSessionId) {
      router.push({
        pathname: '/inner-thoughts/[id]',
        params: {
          id: linkedData.innerThoughtsSessionId,
          partnerSessionId: id,
          // TODO: Pass partner name from session data
        },
      });
      return;
    }

    // Navigate immediately with id="new" - session will be created on target screen
    // This allows showing loading state right away instead of waiting
    router.push({
      pathname: '/inner-thoughts/[id]',
      params: {
        id: 'new',
        partnerSessionId: id,
        linkedTrigger: 'empathy_wait',
      },
    });
  }, [id, linkedData, router]);

  const handleStageComplete = (stage: Stage) => {
    // Optionally refresh or show a transition animation
    // The UnifiedSessionScreen handles stage progression internally
    console.log(`Stage ${stage} completed`);
  };

  if (!id) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // UnifiedSessionScreen has its own header
        }}
      />
      <UnifiedSessionScreen
        sessionId={id}
        onNavigateBack={handleNavigateBack}
        onNavigateToInnerThoughts={handleNavigateToInnerThoughts}
        onStageComplete={handleStageComplete}
      />
    </>
  );
}
