/**
 * Self-Reflection Chat Screen Route
 *
 * Expo Router wrapper for the InnerThoughtsScreen component.
 * Handles both existing sessions and creating new linked sessions.
 *
 * Key design: Uses state instead of router.replace() to avoid component remounting
 * and the associated loading flicker. The cache is pre-populated by the mutation hook.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

import { InnerThoughtsScreen } from '@/src/screens/InnerThoughtsScreen';
import { useCreateInnerThoughtsSession } from '@/src/hooks';
import { trackInnerThoughtsCreated, trackInnerThoughtsLinked } from '@/src/services/analytics';

export default function SelfReflectionChatScreen() {
  const router = useRouter();
  const { id, partnerSessionId, partnerName, linkedTrigger, initialMessage } = useLocalSearchParams<{
    id: string;
    partnerSessionId?: string;
    partnerName?: string;
    linkedTrigger?: string;
    initialMessage?: string;
  }>();

  // Track the created session ID in state to avoid route replacement remounting
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const createSession = useCreateInnerThoughtsSession();
  const hasStartedCreation = useRef(false);

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
      <Stack.Screen options={{ headerShown: false }} />
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
      />
    </>
  );
}
