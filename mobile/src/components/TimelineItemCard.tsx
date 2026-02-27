/**
 * TimelineItemCard Component
 *
 * Unified card for timeline items in the ActivityDrawer.
 * Replaces the separate SentItemCard and ReceivedItemCard components
 * with a single card that handles all item types and directions.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface TimelineItem {
  id: string;
  type: 'empathy' | 'context' | 'invitation' | 'share_offer';
  direction: 'sent' | 'received';
  content: string;
  timestamp: string;
  deliveryStatus?: 'sending' | 'pending' | 'delivered' | 'seen' | 'superseded';
  revisionCount?: number;
  empathyStatus?: string;
  partnerName?: string;
  actionRequired?: boolean;
  actionType?: 'validate' | 'view' | 'respond' | 'refine';
  offerId?: string;
  suggestionText?: string;
  attemptId?: string;
}

export interface TimelineItemCardProps {
  item: TimelineItem;
  onOpenRefinement?: (offerId: string, suggestion: string) => void;
  onShareAsIs?: (offerId: string) => void;
  onOpenEmpathyDetail?: (attemptId: string, content: string) => void;
  onOpenInvitationRefine?: () => void;
  onViewInChat?: () => void;
  testID?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getStatusText(status?: string): string {
  switch (status) {
    case 'sending':
      return 'Sending...';
    case 'pending':
      return 'On its way';
    case 'delivered':
      return 'Delivered';
    case 'seen':
      return 'Seen';
    case 'superseded':
      return 'Updated version sent';
    default:
      return '';
  }
}

function getTypeLabel(type: string, direction: string): string {
  switch (type) {
    case 'empathy':
      return direction === 'sent' ? 'Understanding shared' : 'Understanding of you';
    case 'context':
      return direction === 'sent' ? 'Context shared' : 'Context for you';
    case 'invitation':
      return 'Invitation sent';
    case 'share_offer':
      return 'Sharing suggestion';
    default:
      return '';
  }
}

function formatRelativeTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString();
}

// ============================================================================
// Component
// ============================================================================

export function TimelineItemCard({
  item,
  onOpenRefinement,
  onShareAsIs,
  onOpenEmpathyDetail,
  onOpenInvitationRefine,
  onViewInChat,
  testID,
}: TimelineItemCardProps) {
  const resolvedTestID = testID || `timeline-item-${item.id}`;
  const borderColor = item.direction === 'sent' ? colors.accent : colors.success;
  const typeLabel = getTypeLabel(item.type, item.direction);
  const statusText = getStatusText(item.deliveryStatus);
  const relativeTime = formatRelativeTimestamp(item.timestamp);

  // Determine if card is tappable (empathy sent → detail, invitation → refine)
  const isTappable =
    (item.type === 'empathy' && item.direction === 'sent' && !!onOpenEmpathyDetail) ||
    (item.type === 'invitation' && !!onOpenInvitationRefine);

  const handleCardPress = () => {
    if (item.type === 'empathy' && item.direction === 'sent' && onOpenEmpathyDetail) {
      onOpenEmpathyDetail(item.attemptId || item.id, item.content);
    } else if (item.type === 'invitation' && onOpenInvitationRefine) {
      onOpenInvitationRefine();
    }
  };

  // Share offer with action required: show Refine + Share as-is buttons
  const showShareOfferActions =
    item.type === 'share_offer' && item.actionRequired && item.offerId;

  // Context received with view action
  const showViewInChatAction =
    item.type === 'context' &&
    item.direction === 'received' &&
    item.actionType === 'view' &&
    !!onViewInChat;

  const cardContent = (
    <>
      {/* Header row: direction + type label + timestamp */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.directionLabel, item.direction === 'sent' ? styles.directionSent : styles.directionReceived]}>
            {item.direction === 'sent' ? 'You' : item.partnerName || 'Partner'}
          </Text>
          <Text style={styles.typeLabel}>{typeLabel}</Text>
        </View>
        <Text style={styles.timestamp}>{relativeTime}</Text>
      </View>

      {/* Content */}
      <Text style={styles.content}>
        {item.content}
      </Text>

      {/* Delivery status */}
      {statusText !== '' && (
        <Text style={styles.statusText}>{statusText}</Text>
      )}

      {/* Revision count */}
      {item.revisionCount != null && item.revisionCount > 0 && (
        <Text style={styles.revisionNote}>
          Revised {item.revisionCount} time{item.revisionCount > 1 ? 's' : ''}
        </Text>
      )}

      {/* Share offer action buttons */}
      {showShareOfferActions && (
        <View style={styles.actions}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => onOpenRefinement?.(item.offerId!, item.suggestionText || item.content)}
            accessibilityRole="button"
            accessibilityLabel="Refine this suggestion before sharing"
            testID={`${resolvedTestID}-refine`}
          >
            <Text style={styles.secondaryButtonText}>Refine</Text>
          </Pressable>
          <Pressable
            style={styles.primaryButton}
            onPress={() => onShareAsIs?.(item.offerId!)}
            accessibilityRole="button"
            accessibilityLabel="Share this suggestion as-is"
            testID={`${resolvedTestID}-share-as-is`}
          >
            <Text style={styles.primaryButtonText}>Share as-is</Text>
          </Pressable>
        </View>
      )}

      {/* View in chat action */}
      {showViewInChatAction && (
        <Pressable
          style={styles.viewInChatButton}
          onPress={onViewInChat}
          accessibilityRole="button"
          accessibilityLabel="View this context in the chat"
          testID={`${resolvedTestID}-view-in-chat`}
        >
          <Text style={styles.viewInChatText}>View in chat</Text>
        </Pressable>
      )}
    </>
  );

  if (isTappable) {
    return (
      <Pressable
        style={[styles.card, { borderLeftColor: borderColor }]}
        onPress={handleCardPress}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel}: ${item.content.substring(0, 80)}`}
        testID={resolvedTestID}
      >
        {cardContent}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.card, { borderLeftColor: borderColor }]}
      testID={resolvedTestID}
    >
      {cardContent}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  directionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  directionSent: {
    color: '#fbbf24',
  },
  directionReceived: {
    color: '#34d399',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timestamp: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  statusText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  revisionNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textOnAccent,
  },
  viewInChatButton: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  viewInChatText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.brandBlue,
  },
});

export default TimelineItemCard;
