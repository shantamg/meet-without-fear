import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors } from '@/theme';
import { ChatInterface, ChatMessage } from './ChatInterface';

export interface GuidedDraftMessage extends ChatMessage {
  proposedContent?: string | null;
}

export interface GuidedDraftChatModalProps {
  visible: boolean;
  title: string;
  sessionKey: string;
  messages: GuidedDraftMessage[];
  isLoading: boolean;
  isFinalizing: boolean;
  partnerName: string;
  proposalTitle: string;
  proposalSubtitle: string;
  finalActionLabel: string;
  finalActionLatestOnly?: boolean;
  onSendMessage: (content: string) => void;
  onFinalize: (content: string) => void;
  onClose: () => void;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  finalButtonTestID?: string;
  testID?: string;
}

export function GuidedDraftChatModal({
  visible,
  title,
  sessionKey,
  messages,
  isLoading,
  isFinalizing,
  partnerName,
  proposalTitle,
  proposalSubtitle,
  finalActionLabel,
  finalActionLatestOnly = false,
  onSendMessage,
  onFinalize,
  onClose,
  emptyStateTitle,
  emptyStateMessage,
  finalButtonTestID,
  testID = 'guided-draft-chat-modal',
}: GuidedDraftChatModalProps) {
  const insets = useSafeAreaInsets();
  const latestProposalMessageId = [...messages].reverse().find((message) => message.proposedContent)?.id ?? null;

  const renderMessageExtra = useCallback((message: ChatMessage) => {
    const draftMessage = message as GuidedDraftMessage;
    if (!draftMessage.proposedContent) return null;
    const showFinalAction = !finalActionLatestOnly || draftMessage.id === latestProposalMessageId;

    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftTitle}>{proposalTitle}</Text>
          <Text style={styles.draftSubtitle}>{proposalSubtitle}</Text>
        </View>
        <Text style={styles.draftContent}>"{draftMessage.proposedContent}"</Text>
        {showFinalAction ? (
          <TouchableOpacity
            style={[styles.finalButton, isFinalizing && styles.finalButtonDisabled]}
            onPress={() => onFinalize(draftMessage.proposedContent!)}
            disabled={isFinalizing}
            testID={finalButtonTestID || `${testID}-final-button`}
          >
            {isFinalizing ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.finalButtonText}>{finalActionLabel}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [
    finalActionLabel,
    finalActionLatestOnly,
    isFinalizing,
    finalButtonTestID,
    latestProposalMessageId,
    onFinalize,
    proposalSubtitle,
    proposalTitle,
    testID,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      testID={testID}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID={`${testID}-close`}
          >
            <X color={colors.textPrimary} size={24} />
          </TouchableOpacity>
        </View>

        <ChatInterface
          sessionId={sessionKey}
          messages={messages}
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          isInputDisabled={isFinalizing}
          partnerName={partnerName}
          renderMessageExtra={renderMessageExtra}
          emptyStateTitle={emptyStateTitle}
          emptyStateMessage={emptyStateMessage}
        />
      </SafeAreaView>
    </Modal>
  );
}

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
  draftHeader: {
    marginBottom: 10,
  },
  draftTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
  },
  draftSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  draftContent: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  finalButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  finalButtonDisabled: {
    opacity: 0.6,
  },
  finalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

export default GuidedDraftChatModal;
