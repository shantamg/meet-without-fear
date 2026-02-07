/**
 * PartnerEventModal Component
 *
 * A modal that appears when new Partner tab events occur.
 * Shows what happened and lets user navigate to Partner tab or dismiss.
 * Events are detected via Ably real-time updates and can be restored from database.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { MessageCircle, Heart, Send, Check, X } from 'lucide-react-native';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export type PartnerEventType =
  | 'empathy_revealed'       // Partner shared their empathy attempt
  | 'empathy_validated'      // Partner validated your empathy
  | 'context_shared'         // Partner shared context to help you understand
  | 'share_suggestion'       // AI suggests you share something with partner
  | 'validation_needed'      // Partner's empathy needs your validation
  | 'partner_considering_share'; // Partner is deciding whether to share more context

export interface PartnerEventModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Type of event that occurred */
  eventType: PartnerEventType | null;
  /** Partner's display name */
  partnerName: string;
  /** Preview of content (truncated) */
  contentPreview?: string;
  /** Callback to navigate to Partner tab */
  onViewPartnerTab: () => void;
  /** Callback to dismiss the modal */
  onDismiss: () => void;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Event Configurations
// ============================================================================

interface EventConfig {
  title: string;
  message: string;
  icon: React.ReactNode;
  primaryAction: string;
  accentColor: string;
}

function getEventConfig(
  eventType: PartnerEventType,
  partnerName: string
): EventConfig {
  switch (eventType) {
    case 'empathy_revealed':
      return {
        title: 'New Understanding Shared',
        message: `${partnerName} shared how they understand your feelings.`,
        icon: <Heart color={colors.accent} size={32} />,
        primaryAction: 'View',
        accentColor: colors.accent,
      };
    case 'empathy_validated':
      return {
        title: 'Your Empathy Validated',
        message: `${partnerName} confirmed your understanding feels accurate.`,
        icon: <Check color={colors.success} size={32} />,
        primaryAction: 'View',
        accentColor: colors.success,
      };
    case 'context_shared':
      return {
        title: 'Context Shared',
        message: `${partnerName} shared something to help you understand them better.`,
        icon: <MessageCircle color={colors.brandBlue} size={32} />,
        primaryAction: 'View',
        accentColor: colors.brandBlue,
      };
    case 'share_suggestion':
      return {
        title: 'Help Build Understanding',
        message: `${partnerName} is trying to understand you. You can share something to help.`,
        icon: <Send color={colors.accent} size={32} />,
        primaryAction: 'View',
        accentColor: colors.accent,
      };
    case 'validation_needed':
      return {
        title: 'Feedback Needed',
        message: `${partnerName} shared their understanding. Does it feel accurate?`,
        icon: <Heart color={colors.accent} size={32} />,
        primaryAction: 'Give Feedback',
        accentColor: colors.accent,
      };
    case 'partner_considering_share':
      return {
        title: 'Almost There',
        message: `${partnerName} is deciding whether to share more context to help you understand them better.`,
        icon: <MessageCircle color={colors.brandBlue} size={32} />,
        primaryAction: 'Got It',
        accentColor: colors.brandBlue,
      };
  }
}

// ============================================================================
// Component
// ============================================================================

export function PartnerEventModal({
  visible,
  eventType,
  partnerName,
  contentPreview,
  onViewPartnerTab,
  onDismiss,
  testID = 'partner-event-modal',
}: PartnerEventModalProps) {
  if (!eventType) return null;

  const config = getEventConfig(eventType, partnerName);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      testID={testID}
    >
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={`${testID}-close`}
          >
            <X color={colors.textMuted} size={24} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconContainer}>
            {config.icon}
          </View>

          {/* Title */}
          <Text style={styles.title}>{config.title}</Text>

          {/* Message */}
          <Text style={styles.message}>{config.message}</Text>

          {/* Content preview (if any) */}
          {contentPreview && (
            <View style={styles.previewContainer}>
              <Text style={styles.previewText} numberOfLines={3}>
                "{contentPreview}"
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              testID={`${testID}-dismiss`}
            >
              <Text style={styles.dismissButtonText}>Later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: config.accentColor }]}
              onPress={onViewPartnerTab}
              testID={`${testID}-view`}
            >
              <Text style={styles.primaryButtonText}>{config.primaryAction}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  previewContainer: {
    width: '100%',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandBlue,
  },
  previewText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  primaryButton: {
    flex: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
});

export default PartnerEventModal;
