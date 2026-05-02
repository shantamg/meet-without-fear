/**
 * RefinementModalScreen
 *
 * Full-screen modal for refining share offer content via AI-guided chat.
 *
 * Features:
 * - Initial suggestion seeded as first AI message with inline share button
 * - Chat interface for refining the suggestion
 * - Inline draft cards on AI messages with proposed content, each with "Share This Version" button
 * - Close confirmation when user has been chatting (ephemeral chat = data lost)
 * - Stateless chat (client manages history, no DB writes)
 */

import React, { useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { GuidedDraftChatModal } from '../components/GuidedDraftChatModal';
import { useRefinementChat } from '../hooks/useRefinementChat';

// ============================================================================
// Types
// ============================================================================

export interface RefinementModalScreenProps {
  visible: boolean;
  sessionId: string;
  offerId: string;
  initialSuggestion: string;
  partnerName: string;
  onClose: () => void;
  onShareComplete: () => void;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function RefinementModalScreen({
  visible,
  sessionId,
  offerId,
  initialSuggestion,
  partnerName,
  onClose,
  onShareComplete,
  testID = 'refinement-modal',
}: RefinementModalScreenProps) {
  const {
    messages,
    isLoading,
    isFinalizing,
    isFinalized,
    sendMessage,
    finalizeShare,
    resetChat,
  } = useRefinementChat(sessionId, offerId, initialSuggestion);

  // Reset chat when modal opens with new offerId
  useEffect(() => {
    if (visible) {
      resetChat();
    }
  }, [visible, offerId, resetChat]);

  // Close modal when finalization succeeds
  useEffect(() => {
    if (isFinalized) {
      onShareComplete();
    }
  }, [isFinalized, onShareComplete]);

  const handleShareVersion = useCallback((content: string) => {
    finalizeShare(content);
  }, [finalizeShare]);

  const handleClose = useCallback(() => {
    // Skip confirmation if the seeded initial message is the only one (user hasn't chatted)
    if (messages.length <= 1) {
      onClose();
      return;
    }
    Alert.alert(
      'Leave refinement?',
      'This chat and any draft refinements will be lost.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: onClose },
      ]
    );
  }, [messages.length, onClose]);

  return (
    <GuidedDraftChatModal
      visible={visible}
      title="Refining"
      sessionKey={`refinement-${sessionId}-${offerId}`}
      messages={messages}
      isLoading={isLoading}
      isFinalizing={isFinalizing}
      partnerName={partnerName}
      proposalTitle="Draft"
      proposalSubtitle={`This is what will be shared with ${partnerName}`}
      finalActionLabel="Share This Version"
      onSendMessage={sendMessage}
      onFinalize={handleShareVersion}
      onClose={handleClose}
      finalButtonTestID={`${testID}-share-button`}
      testID={testID}
    />
  );
}

export default RefinementModalScreen;
