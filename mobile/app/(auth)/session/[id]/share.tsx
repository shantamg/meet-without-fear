/**
 * Share Screen Route
 *
 * Shows shared content between the user and partner.
 * Navigated to via "Share →" button from the main chat screen.
 * Uses standard navigation with native slide transition.
 *
 * Data sharing: Uses React Query cache populated by the Chat screen.
 * The Ably connection is a singleton shared across the app.
 *
 * Empathy History: Uses messages from cache to detect revision history.
 * Older empathy statements are marked as "superseded" (Updated Below).
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { MessageRole, EmpathyStatus } from '@meet-without-fear/shared';

import { SessionChatHeader } from '@/src/components/SessionChatHeader';
import { PartnerChatTab, EmpathyAttemptWithHistory } from '@/src/components/PartnerChatTab';
import { ViewEmpathyStatementDrawer } from '@/src/components/ViewEmpathyStatementDrawer';
import { RefineInvitationDrawer } from '@/src/components/RefineInvitationDrawer';
import { useSharingStatus } from '@/src/hooks/useSharingStatus';
import { useSessionState, useMarkShareTabViewed } from '@/src/hooks/useSessions';
import { useRespondToShareOffer, useResubmitEmpathy } from '@/src/hooks/useStages';
import { useSendMessage, useInfiniteMessages } from '@/src/hooks/useMessages';
import { useAuth } from '@/src/hooks/useAuth';
import { createInvitationLink } from '@/src/hooks/useInvitation';
import { colors } from '@/src/theme';

export default function ShareScreen() {
  const { id: sessionId, highlight } = useLocalSearchParams<{ id: string; highlight?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // Decode the highlight timestamp if provided
  const highlightTimestamp = highlight ? decodeURIComponent(highlight) : null;

  // Session data from React Query cache (populated by Chat screen)
  const { data: sessionState, isLoading: isLoadingSession } = useSessionState(sessionId ?? '');
  const session = sessionState?.session;
  const invitation = sessionState?.invitation;

  // Sharing status from React Query cache
  const sharingStatus = useSharingStatus(sessionId ?? '');

  // Messages from React Query cache (for empathy revision history)
  const { data: messagesData } = useInfiniteMessages({
    sessionId: sessionId ?? '',
  });

  // Derive empathy history from messages
  // Find all EMPATHY_STATEMENT messages from current user and mark older ones as superseded
  const myEmpathyAttempts = useMemo((): EmpathyAttemptWithHistory[] => {
    if (!messagesData?.pages || !user?.id) {
      // Fall back to single attempt from sharingStatus if no messages yet
      if (sharingStatus.myAttempt) {
        return [sharingStatus.myAttempt];
      }
      return [];
    }

    // Flatten all messages from all pages
    const allMessages = messagesData.pages.flatMap((page) => page.messages);

    // Get shared context content to filter out "what you shared" echo messages
    // These appear as EMPATHY_STATEMENT but are actually echoes of shared context
    const sharedContextContent = sharingStatus.mySharedContext?.content;

    // Filter for EMPATHY_STATEMENT messages from current user
    // Exclude messages that match the shared context (to avoid duplicates)
    const empathyMessages = allMessages.filter(
      (msg) =>
        msg.role === MessageRole.EMPATHY_STATEMENT &&
        msg.senderId === user.id &&
        // Exclude if this is a "what you shared" echo
        msg.content !== sharedContextContent
    );

    if (empathyMessages.length === 0) {
      // No empathy messages, fall back to sharingStatus.myAttempt
      if (sharingStatus.myAttempt) {
        return [sharingStatus.myAttempt];
      }
      return [];
    }

    // Sort by timestamp (oldest first for display)
    const sortedMessages = [...empathyMessages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // The latest one (last in sorted array) is NOT superseded
    // All others are superseded
    const latestId = sortedMessages[sortedMessages.length - 1]?.id;

    // Convert messages to EmpathyAttemptWithHistory
    return sortedMessages.map((msg): EmpathyAttemptWithHistory => {
      const isSuperseded = msg.id !== latestId;

      // Use delivery status from message if available, otherwise derive from sharingStatus
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageDeliveryStatus = (msg as any).sharedContentDeliveryStatus;
      const deliveryStatus = isSuperseded
        ? 'superseded'
        : messageDeliveryStatus ?? sharingStatus.myAttempt?.deliveryStatus ?? 'pending';

      // Use status from sharingStatus for the latest attempt, otherwise default to the message's implied status
      const status: EmpathyStatus = isSuperseded
        ? EmpathyStatus.READY // Superseded attempts are effectively "done" (but never delivered)
        : sharingStatus.myAttempt?.status ?? EmpathyStatus.HELD;

      return {
        id: msg.id,
        sourceUserId: msg.senderId ?? user.id,
        content: msg.content,
        sharedAt: msg.timestamp,
        consentRecordId: '', // Not available from message
        status,
        revealedAt: null,
        revisionCount: 0, // Calculated implicitly by position
        deliveryStatus,
        isSuperseded,
      };
    });
  }, [messagesData, user?.id, sharingStatus.myAttempt, sharingStatus.mySharedContext]);

  // Mutations
  const { mutate: respondToShareOffer } = useRespondToShareOffer();
  const { mutate: markShareTabViewed } = useMarkShareTabViewed(sessionId);
  const { mutate: resubmitEmpathy } = useResubmitEmpathy();
  const { mutate: sendMessage } = useSendMessage();

  // Local state for drawers
  const [showEmpathyDrawer, setShowEmpathyDrawer] = useState(false);
  const [showRefineDrawer, setShowRefineDrawer] = useState(false);
  const [isRefiningInvitation, setIsRefiningInvitation] = useState(false);

  // Invitation URL for sharing
  const invitationUrl = useMemo(() => {
    if (invitation?.id) {
      return createInvitationLink(invitation.id);
    }
    return '';
  }, [invitation?.id]);

  // Get invitation message
  const invitationMessage = invitation?.invitationMessage;

  // Mark Share tab as viewed on mount - this triggers "seen" delivery status for shared content
  const hasMarkedViewed = useRef(false);
  useEffect(() => {
    if (sessionId && !hasMarkedViewed.current) {
      hasMarkedViewed.current = true;
      markShareTabViewed();
    }
  }, [sessionId, markShareTabViewed]);

  const partnerName = session?.partner?.nickname ?? session?.partner?.name ?? 'Partner';

  const handleRespondToShareOffer = (response: 'accept' | 'decline') => {
    if (sharingStatus.shareOffer && sessionId) {
      const sharedContent = response === 'accept' ? sharingStatus.shareOffer.suggestedContent : undefined;
      respondToShareOffer({ sessionId, action: response, sharedContent });
    }
  };

  const handleBackToChat = () => {
    router.back();
  };

  const handleInvitationPress = () => {
    // Open the refine invitation drawer
    setShowRefineDrawer(true);
  };

  const handleSendInvitationRefinement = (message: string) => {
    if (!sessionId) return;

    // Set loading state
    setIsRefiningInvitation(true);

    // Send refinement message - backend will detect "Refine invitation:" prefix
    // and use the invitation prompt context
    const refinementMessage = `Refine invitation: ${message}`;
    sendMessage({ sessionId, content: refinementMessage });

    // The invitation will be updated via the backend when the AI responds.
    // After a delay, clear the loading state. The invitation message will update
    // from React Query cache when session state is invalidated.
    setTimeout(() => {
      setIsRefiningInvitation(false);
    }, 5000);
  };

  if (!sessionId) {
    return null;
  }

  if (isLoadingSession) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SessionChatHeader
          partnerName={partnerName}
          onBackPress={handleBackToChat}
          testID="share-screen-header"
        />
        <PartnerChatTab
          sessionId={sessionId}
          partnerName={partnerName}
          myEmpathyAttempts={myEmpathyAttempts}
          partnerEmpathyAttempt={sharingStatus.partnerAttempt}
          sharedContextSent={sharingStatus.mySharedContext ? [sharingStatus.mySharedContext] : []}
          sharedContextReceived={sharingStatus.sharedContext}
          // Don't show share suggestion if content has already been shared
          shareSuggestion={sharingStatus.mySharedContext ? null : sharingStatus.shareOffer}
          partnerEmpathyNeedsValidation={sharingStatus.needsToValidatePartner}
          isAnalyzing={sharingStatus.isAnalyzing}
          awaitingSharing={sharingStatus.hasSuggestion}
          myReconcilerResult={sharingStatus.myReconcilerResult}
          partnerHasSubmittedEmpathy={sharingStatus.partnerHasSubmittedEmpathy}
          partnerEmpathyHeldStatus={sharingStatus.partnerEmpathyHeldStatus}
          partnerEmpathySubmittedAt={sharingStatus.partnerEmpathySubmittedAt}
          onValidateAccurate={() => {/* Validation handled in Chat screen */}}
          onValidatePartial={() => {/* Validation handled in Chat screen */}}
          onValidateInaccurate={() => {/* Validation handled in Chat screen */}}
          onShareSuggestionAccept={() => handleRespondToShareOffer('accept')}
          onShareSuggestionDecline={() => handleRespondToShareOffer('decline')}
          onShareSuggestionEdit={() => {
            // Navigate back to chat for editing
            router.back();
          }}
          onRefineEmpathy={() => {
            // Open the empathy drawer directly on this screen
            setShowEmpathyDrawer(true);
          }}
          hasActiveInvitation={invitation?.isInviter && !invitation?.acceptedAt}
          onInvitationPress={handleInvitationPress}
          highlightTimestamp={highlightTimestamp}
          onHighlightComplete={() => {
            // Clear the URL param after highlight completes
            router.setParams({ highlight: undefined });
          }}
          testID="share-screen-partner-tab"
        />
      </SafeAreaView>

      {/* Empathy Refinement Drawer */}
      {/* Use the latest (non-superseded) empathy attempt for the drawer */}
      {(() => {
        const latestAttempt = myEmpathyAttempts.find((a) => !a.isSuperseded) ||
          myEmpathyAttempts[myEmpathyAttempts.length - 1];
        const content = latestAttempt?.content;

        if (!content) return null;

        return (
          <ViewEmpathyStatementDrawer
            visible={showEmpathyDrawer}
            statement={content}
            partnerName={partnerName}
            isRevising={true}
            onShare={() => {
              // Resubmit the empathy statement
              if (sessionId && content) {
                resubmitEmpathy({ sessionId, content });
              }
              setShowEmpathyDrawer(false);
              // Navigate to AI chat to see the acknowledgment message
              router.back();
            }}
            onSendRefinement={(message) => {
              // Send refinement message to AI and navigate to chat
              if (sessionId) {
                const refined = message.trim().toLowerCase().startsWith('refine empathy draft')
                  ? message
                  : `Refine empathy draft: ${message}`;
                sendMessage({ sessionId, content: refined });
              }
              setShowEmpathyDrawer(false);
              router.back(); // Go to chat to see the AI response
            }}
            onClose={() => setShowEmpathyDrawer(false)}
          />
        );
      })()}

      {/* Refine Invitation Drawer */}
      {invitationMessage && invitationUrl && (
        <RefineInvitationDrawer
          visible={showRefineDrawer}
          invitationMessage={invitationMessage}
          invitationUrl={invitationUrl}
          partnerName={partnerName}
          senderName={user?.name || user?.firstName || undefined}
          isRefining={isRefiningInvitation}
          onSendRefinement={handleSendInvitationRefinement}
          onShareSuccess={() => setShowRefineDrawer(false)}
          onClose={() => setShowRefineDrawer(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
