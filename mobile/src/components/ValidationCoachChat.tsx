
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ChatInterface, ChatMessage } from './ChatInterface';
import { MessageRole } from '@meet-without-fear/shared';
import { colors, spacing } from '@/theme';
// Import hooks via relative path to avoid circular dependencies if exporting from index
import {
  useSaveValidationFeedbackDraft,
  useRefineValidationFeedback
} from '../hooks/useStages';

interface ValidationCoachChatProps {
  sessionId: string;
  initialDraft?: string;
  onCancel: () => void;
  onComplete: (feedback: string) => void;
  partnerName: string;
  testID?: string;
}

export function ValidationCoachChat({
  sessionId,
  initialDraft,
  onCancel,
  onComplete,
  partnerName,
  testID,
}: ValidationCoachChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposedFeedback, setProposedFeedback] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Hooks
  const { mutate: refineFeedback, isPending: isRefining } = useRefineValidationFeedback();
  const { mutate: saveDraft } = useSaveValidationFeedbackDraft();

  // Initialize coach with the draft (if provided)
  useEffect(() => {
    if (initialDraft && initialDraft.trim() && isInitializing) {
      // Add initial user message locally
      const initialUserMsg: ChatMessage = {
        id: 'initial-user-msg',
        sessionId,
        role: MessageRole.USER,
        content: initialDraft,
        timestamp: new Date().toISOString(),
        senderId: 'me',
        stage: 2,
      };
      setMessages([initialUserMsg]);
      setIsInitializing(false);

      // Send to AI
      handleRefine(initialDraft);
    } else if (isInitializing) {
      // No initial draft - just mark as initialized
      setIsInitializing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft, isInitializing]);

  const handleRefine = (content: string) => {
    refineFeedback(
      { sessionId, message: content },
      {
        onSuccess: (data) => {
          // Add AI response
          const aiMsg: ChatMessage = {
            id: `ai-msg-${Date.now()}`,
            sessionId,
            role: MessageRole.AI,
            content: data.response,
            timestamp: new Date().toISOString(),
            senderId: 'ai',
            stage: 2,
          };

          setMessages((prev) => [...prev, aiMsg]);

          if (data.proposedFeedback) {
            setProposedFeedback(data.proposedFeedback);
            // Auto-save draft in background
            saveDraft({
              sessionId,
              content: data.proposedFeedback,
              readyToShare: false,
            });
          }
        },
        onError: (error) => {
          console.error('Failed to refine feedback:', error);
          // Add error message to chat
          const errorMsg: ChatMessage = {
            id: `err-msg-${Date.now()}`,
            sessionId,
            role: MessageRole.SYSTEM,
            content: 'Sorry, I had trouble processing that. Please try again.',
            timestamp: new Date().toISOString(),
            senderId: 'system',
            stage: 2,
          };
          setMessages((prev) => [...prev, errorMsg]);
        },
      }
    );
  };

  const handleSendMessage = (content: string) => {
    // Add user message locally
    const userMsg: ChatMessage = {
      id: `user-msg-${Date.now()}`,
      sessionId,
      role: MessageRole.USER,
      content,
      timestamp: new Date().toISOString(),
      senderId: 'me',
      stage: 2,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Send to AI
    handleRefine(content);
  };

  const handleApprove = () => {
    if (proposedFeedback) {
      onComplete(proposedFeedback);
    }
  };

  // Render the "Proposed Feedback" card above input
  const renderProposedFeedback = () => {
    if (!proposedFeedback) return null;

    return (
      <View style={styles.proposalCard}>
        <View style={styles.proposalHeader}>
          <Text style={styles.proposalTitle}>Proposed Feedback</Text>
          <Text style={styles.proposalSubtitle}>This is what will be sent to {partnerName}</Text>
        </View>
        <View style={styles.proposalContent}>
          <Text style={styles.proposalText}>{proposedFeedback}</Text>
        </View>
        <View style={styles.proposalActions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            testID="cancel-feedback-button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.approveButton}
            onPress={handleApprove}
            testID="send-feedback-button"
          >
            <Text style={styles.approveText}>Send Feedback</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feedback Coach</Text>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isRefining}
        partnerName={partnerName}
        renderAboveInput={renderProposedFeedback}
        emptyStateTitle="Refining Feedback"
        emptyStateMessage="I'll help you craft constructive feedback so your partner can understand exactly what was missed."
      />
    </View>
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
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  proposalCard: {
    margin: spacing.md,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    overflow: 'hidden',
  },
  proposalHeader: {
    padding: spacing.sm,
    backgroundColor: 'rgba(16, 163, 127, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(16, 163, 127, 0.2)',
  },
  proposalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
  },
  proposalSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  proposalContent: {
    padding: spacing.md,
  },
  proposalText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  proposalActions: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  approveButton: {
    flex: 2,
    backgroundColor: colors.accent,
    padding: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
