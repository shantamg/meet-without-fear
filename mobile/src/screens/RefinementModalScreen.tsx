/**
 * RefinementModalScreen
 *
 * Full-screen modal for refining share offer content via AI-guided chat.
 * Follows the same pattern as ValidationCoachChat but in a full modal.
 *
 * Features:
 * - Shows AI's initial suggestion at the top
 * - Chat interface for refining the suggestion
 * - "Share This Version" button on AI messages with proposed content
 * - Stateless chat (client manages history, no DB writes)
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors, spacing } from '@/theme';
import { ChatInterface, ChatMessage } from '../components/ChatInterface';
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
    latestProposedContent,
    isLoading,
    isFinalizing,
    isFinalized,
    sendMessage,
    finalizeShare,
    resetChat,
  } = useRefinementChat(sessionId, offerId);

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

  const handleShareVersion = (content: string) => {
    finalizeShare(content);
  };

  // Render the initial suggestion as a card above the chat
  const renderInitialSuggestion = () => (
    <View style={styles.suggestionCard}>
      <Text style={styles.suggestionLabel}>AI's suggestion for what to share:</Text>
      <Text style={styles.suggestionText}>"{initialSuggestion}"</Text>
      <Text style={styles.suggestionHint}>
        Chat below to refine this, or share it as-is.
      </Text>
    </View>
  );

  // Render the "Share This Version" button below AI messages with proposed content
  const renderProposedContent = () => {
    const contentToShare = latestProposedContent || initialSuggestion;

    return (
      <View style={styles.shareCard}>
        <View style={styles.shareCardHeader}>
          <Text style={styles.shareCardLabel}>Ready to share</Text>
        </View>
        <Text style={styles.shareCardContent}>"{contentToShare}"</Text>
        <TouchableOpacity
          style={[styles.shareButton, isFinalizing && styles.shareButtonDisabled]}
          onPress={() => handleShareVersion(contentToShare)}
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
  };

  // Cast messages to ChatMessage[] for ChatInterface compatibility
  const chatMessages: ChatMessage[] = messages;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      testID={testID}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Refining</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID={`${testID}-close`}
          >
            <X color={colors.textPrimary} size={24} />
          </TouchableOpacity>
        </View>

        {/* Initial suggestion */}
        {renderInitialSuggestion()}

        {/* Chat interface */}
        <ChatInterface
          sessionId={`refinement-${sessionId}-${offerId}`}
          messages={chatMessages}
          onSendMessage={sendMessage}
          isLoading={isLoading}
          partnerName={partnerName}
          renderAboveInput={renderProposedContent}
          emptyStateTitle="Refine Your Share"
          emptyStateMessage="Tell me how you'd like to adjust what gets shared. I'll help you find the right words."
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
    paddingVertical: 12,
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
  suggestionCard: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  suggestionText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  suggestionHint: {
    fontSize: 13,
    color: colors.textMuted,
  },
  shareCard: {
    margin: spacing.md,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    overflow: 'hidden',
  },
  shareCardHeader: {
    padding: spacing.sm,
    backgroundColor: 'rgba(16, 163, 127, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(16, 163, 127, 0.2)',
  },
  shareCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
  },
  shareCardContent: {
    padding: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  shareButton: {
    margin: spacing.sm,
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
