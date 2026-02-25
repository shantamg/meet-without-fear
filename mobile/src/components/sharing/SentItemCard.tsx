/**
 * SentItemCard Component
 *
 * Displays a sent item (empathy attempt or shared context) with delivery status.
 * Reuses styling patterns from EmpathyAttemptCard.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Check, Clock, Eye } from 'lucide-react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface SentItem {
  id: string;
  type: 'empathy' | 'context' | 'invitation';
  content: string;
  timestamp: string;
  deliveryStatus?: 'sending' | 'pending' | 'delivered' | 'seen' | 'superseded';
  revisionCount?: number;
  empathyStatus?: string;
  partnerName?: string;
}

export interface SentItemCardProps {
  item: SentItem;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getDeliveryIcon(status?: string) {
  switch (status) {
    case 'sending':
      return <Clock color={colors.textMuted} size={12} />;
    case 'pending':
      return <Clock color={colors.textMuted} size={12} />;
    case 'delivered':
      return <Check color={colors.success} size={12} />;
    case 'seen':
      return <Eye color={colors.success} size={12} />;
    default:
      return null;
  }
}

const UNDELIVERED_STATUSES = new Set(['HELD', 'ANALYZING', 'AWAITING_SHARING', 'REFINING']);

function getEmpathyStatusText(status: string | undefined, partnerName: string): string | null {
  switch (status) {
    case 'HELD':
      return `Your words are held safely until ${partnerName} is ready`;
    case 'ANALYZING':
      return 'Taking shape...';
    case 'AWAITING_SHARING':
      return `Taking shape \u2014 ${partnerName} may add more`;
    case 'REFINING':
      return `New perspective received \u2014 you can revisit yours`;
    case 'READY':
      return `Ready \u2014 ${partnerName} is still working on theirs`;
    case 'REVEALED':
      return `Shared with ${partnerName}`;
    case 'VALIDATED':
      return `${partnerName} says this feels right`;
    default:
      return null;
  }
}

function formatTimestamp(iso: string): string {
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

export function SentItemCard({
  item,
  onPress,
  style,
  testID = 'sent-item-card',
}: SentItemCardProps) {
  const borderColor =
    item.type === 'empathy' ? colors.accent :
    item.type === 'invitation' ? colors.success :
    colors.brandBlue;
  const typeLabel =
    item.type === 'empathy' ? 'Empathy' :
    item.type === 'invitation' ? 'Invitation' :
    'Context';

  const isUndelivered = item.type === 'empathy' && UNDELIVERED_STATUSES.has(item.empathyStatus || '');
  const partnerName = item.partnerName || 'Partner';
  const statusText = item.type === 'empathy' ? getEmpathyStatusText(item.empathyStatus, partnerName) : null;

  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.7 } : {};

  return (
    <Wrapper
      {...wrapperProps}
      style={[
        styles.card,
        { borderLeftColor: borderColor },
        isUndelivered && styles.dashedBorder,
        style,
      ]}
      testID={testID}
    >
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: borderColor + '20', borderColor }]}>
          <Text style={[styles.typeText, { color: borderColor }]}>{typeLabel}</Text>
        </View>
        <View style={styles.timestampRow}>
          {getDeliveryIcon(item.deliveryStatus)}
          <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
        </View>
      </View>

      <Text style={styles.content}>
        "{item.content}"
      </Text>

      {statusText && (
        <Text style={styles.statusText}>{statusText}</Text>
      )}

      {item.revisionCount != null && item.revisionCount > 0 && (
        <Text style={styles.revisionNote}>
          Revised {item.revisionCount} time{item.revisionCount > 1 ? 's' : ''}
        </Text>
      )}
    </Wrapper>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: colors.textMuted,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  dashedBorder: {
    borderStyle: 'dashed',
  },
  statusText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  revisionNote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default SentItemCard;
