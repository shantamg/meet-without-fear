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
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors } from '@/theme';
import { ChatInterface, ChatMessage } from '../components/ChatInterface';
import { useRefinementChat, RefinementMessage } from '../hooks/useRefinementChat';

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
  const insets = useSafeAreaInsets();
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

  // Render inline draft card below AI messages that have proposedContent
  const renderMessageExtra = useCallback((message: ChatMessage) => {
    const rfMsg = message as RefinementMessage;
    if (!rfMsg.proposedContent) return null;
    return (
      <View style={styles.draftCard}>
        <Text style={styles.draftContent}>"{rfMsg.proposedContent}"</Text>
        <TouchableOpacity
          style={[styles.shareButton, isFinalizing && styles.shareButtonDisabled]}
          onPress={() => handleShareVersion(rfMsg.proposedContent!)}
          disabled={isFinalizing}
          testID={`${testID}-share-button`}
        >
          {isFinalizing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.shareButtonText}>Share This Version</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }, [isFinalizing, handleShareVersion, testID]);

  // Cast messages to ChatMessage[] for ChatInterface compatibility
  const chatMessages: ChatMessage[] = messages;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      testID={testID}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.headerTitle}>Refining</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            testID={`${testID}-close`}
          >
            <X color={colors.textPrimary} size={24} />
          </TouchableOpacity>
        </View>

        {/* Chat interface */}
        <ChatInterface
          sessionId={`refinement-${sessionId}-${offerId}`}
          messages={chatMessages}
          onSendMessage={sendMessage}
          isLoading={isLoading}
          partnerName={partnerName}
          renderMessageExtra={renderMessageExtra}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  draftCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  draftContent: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  shareButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});

export default RefinementModalScreen;
