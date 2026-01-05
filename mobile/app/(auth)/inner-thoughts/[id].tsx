/**
 * Inner Thoughts Chat Screen Route
 *
 * Expo Router wrapper for the InnerThoughtsScreen component.
 * Handles both existing sessions and creating new linked sessions.
 */

import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';

import { InnerThoughtsScreen } from '@/src/screens/InnerThoughtsScreen';
import { useCreateInnerThoughtsSession } from '@/src/hooks';
import { trackInnerThoughtsCreated, trackInnerThoughtsLinked } from '@/src/services/analytics';

export default function InnerThoughtsChatScreen() {
  const router = useRouter();
  const { id, partnerSessionId, partnerName, linkedTrigger } = useLocalSearchParams<{
    id: string;
    partnerSessionId?: string;
    partnerName?: string;
    linkedTrigger?: string;
  }>();

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
        },
        {
          onSuccess: (result) => {
            // Track inner thoughts creation
            trackInnerThoughtsCreated(result.session.id);

            // Track linking if connected to a partner session
            if (partnerSessionId) {
              trackInnerThoughtsLinked(result.session.id, partnerSessionId);
            }

            // Replace the route with the real session ID
            router.replace({
              pathname: '/inner-thoughts/[id]',
              params: {
                id: result.session.id,
                partnerSessionId: partnerSessionId || '',
                partnerName: partnerName || '',
              },
            });
          },
          onError: (err) => {
            console.error('Failed to create Inner Thoughts session:', err);
            router.back();
          },
        }
      );
    }
  }, [id, partnerSessionId, linkedTrigger, partnerName, createSession, router]);

  // Show creating state when id="new"
  const isCreating = id === 'new';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <InnerThoughtsScreen
        sessionId={isCreating ? '' : (id || '')}
        linkedPartnerName={partnerName}
        onNavigateBack={() => router.back()}
        onNavigateToPartnerSession={
          partnerSessionId
            ? () => router.replace(`/session/${partnerSessionId}`)
            : undefined
        }
        isCreating={isCreating}
      />
    </>
  );
}
