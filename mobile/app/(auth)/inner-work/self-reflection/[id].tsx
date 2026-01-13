/**
 * Self-Reflection Chat Screen Route
 *
 * Expo Router wrapper for the InnerThoughtsScreen component.
 * Handles both existing sessions and creating new linked sessions.
 *
 * Transition behavior:
 * - New sessions (id="new"): Fade in, wait for fade before showing chat
 * - Existing sessions: Normal slide transition
 * - Back navigation: Standard swipe gesture (slide out)
 *
 * Key design: Uses state instead of router.replace() to avoid component remounting
 * and the associated loading flicker. The cache is pre-populated by the mutation hook.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SuggestedAction } from '@meet-without-fear/shared';

import { InnerThoughtsScreen } from '@/src/screens/InnerThoughtsScreen';
import { useCreateInnerThoughtsSession } from '@/src/hooks';
import { trackInnerThoughtsCreated, trackInnerThoughtsLinked } from '@/src/services/analytics';

const FADE_DURATION = 300; // Match the fade animation duration

export default function SelfReflectionChatScreen() {
  const router = useRouter();
  const { id, partnerSessionId, partnerName, linkedTrigger, initialMessage } = useLocalSearchParams<{
    id: string;
    partnerSessionId?: string;
    partnerName?: string;
    linkedTrigger?: string;
    initialMessage?: string;
  }>();

  const isNewSession = id === 'new';

  // Track the created session ID in state to avoid route replacement remounting
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  // Store suggested actions from session creation (e.g., "Start conversation with Jason")
  const [initialSuggestedActions, setInitialSuggestedActions] = useState<SuggestedAction[] | undefined>(undefined);
  // Track when the fade transition has completed (only for new sessions)
  const [transitionComplete, setTransitionComplete] = useState(!isNewSession);
  const createSession = useCreateInnerThoughtsSession();
  const hasStartedCreation = useRef(false);

  // Wait for fade transition to complete before showing content (new sessions only)
  useEffect(() => {
    if (isNewSession && !transitionComplete) {
      const timer = setTimeout(() => {
        setTransitionComplete(true);
      }, FADE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isNewSession, transitionComplete]);

  // Handle creating a new session when id="new"
  useEffect(() => {
    if (id === 'new' && !hasStartedCreation.current) {
      hasStartedCreation.current = true;
      createSession.mutate(
        {
          linkedPartnerSessionId: partnerSessionId,
          linkedTrigger: linkedTrigger || 'voluntary',
          initialMessage: initialMessage,
        },
        {
          onSuccess: (result) => {
            // Track creation
            trackInnerThoughtsCreated(result.session.id);

            // Track linking if connected to a partner session
            if (partnerSessionId) {
              trackInnerThoughtsLinked(result.session.id, partnerSessionId);
            }

            // Capture suggested actions from the AI response (e.g., "Start conversation with Jason")
            if (result.suggestedActions && result.suggestedActions.length > 0) {
              setInitialSuggestedActions(result.suggestedActions);
            }

            // Update state instead of router.replace() to avoid component remount
            setCreatedSessionId(result.session.id);
          },
          onError: (err) => {
            console.error('Failed to create self-reflection session:', err);
            router.back();
          },
        }
      );
    }
  }, [id, partnerSessionId, linkedTrigger, initialMessage, createSession, router]);

  // Use created session ID if available, otherwise use URL id
  const effectiveSessionId = createdSessionId || (id === 'new' ? '' : (id || ''));
  const isCreating = id === 'new' && !createdSessionId;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          // Use fade for new sessions, slide for existing
          animation: isNewSession ? 'fade' : 'slide_from_right',
          // Ensure swipe back works
          gestureEnabled: true,
        }}
      />
      <InnerThoughtsScreen
        sessionId={effectiveSessionId}
        linkedPartnerName={partnerName}
        onNavigateBack={() => router.back()}
        onNavigateToPartnerSession={
          partnerSessionId
            ? () => router.replace(`/session/${partnerSessionId}`)
            : undefined
        }
        isCreating={isCreating}
        initialMessage={initialMessage}
        initialSuggestedActions={initialSuggestedActions}
        hideContentUntilReady={!transitionComplete}
      />
    </>
  );
}
