/**
 * ReceivedItemCard Component
 *
 * Displays a received item in the activity menu's "Received" tab:
 * - Reconciler share offers (with Refine / Share as-is buttons)
 * - Partner's empathy (needing validation)
 * - Received shared context (informational)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export type ReceivedItemType = 'share_offer' | 'validate_empathy' | 'context_received';

export interface ReceivedItem {
  id: string;
  type: ReceivedItemType;
  content: string;
  timestamp?: string;
  partnerName?: string;
  /** Whether this item is unread / pending action */
  isPending?: boolean;
  /** Additional data for the item */
  metadata?: Record<string, unknown>;
}

export interface ReceivedItemCardProps {
  item: ReceivedItem;
  /** Called when "Refine" is tapped on a share offer */
  onRefine?: (offerId: string) => void;
  /** Called when "Share as-is" is tapped on a share offer */
  onShareAsIs?: (offerId: string) => void;
  /** Called when an accuracy rating is selected for partner's empathy */
  onValidate?: (attemptId: string, rating: 'accurate' | 'partial' | 'inaccurate') => void;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ReceivedItemCard({
  item,
  onRefine,
  onShareAsIs,
  onValidate,
  style,
  testID = 'received-item-card',
}: ReceivedItemCardProps) {
  const partnerName = item.partnerName || 'Partner';

  const renderShareOffer = () => (
    <>
      <Text style={styles.heading}>Help {partnerName} understand you better</Text>
      <Text style={styles.content} numberOfLines={4}>
        "{item.content}"
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => onRefine?.(item.id)}
          testID={`${testID}-refine`}
        >
          <Text style={styles.secondaryButtonText}>Refine</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => onShareAsIs?.(item.id)}
          testID={`${testID}-share-as-is`}
        >
          <Text style={styles.primaryButtonText}>Share as-is</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderValidateEmpathy = () => (
    <>
      <Text style={styles.heading}>{partnerName}'s understanding</Text>
      <Text style={styles.content} numberOfLines={4}>
        "{item.content}"
      </Text>
      <View style={styles.validationActions}>
        <TouchableOpacity
          style={styles.validationButton}
          onPress={() => onValidate?.(item.id, 'accurate')}
          testID={`${testID}-accurate`}
        >
          <Text style={styles.validationButtonText}>Accurate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.validationButton}
          onPress={() => onValidate?.(item.id, 'partial')}
          testID={`${testID}-partial`}
        >
          <Text style={styles.validationButtonText}>Partially</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.validationButton, styles.validationButtonNegative]}
          onPress={() => onValidate?.(item.id, 'inaccurate')}
          testID={`${testID}-inaccurate`}
        >
          <Text style={[styles.validationButtonText, styles.validationButtonTextNeg]}>Not quite</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderContextReceived = () => (
    <>
      <Text style={styles.heading}>{partnerName} shared context</Text>
      <Text style={styles.content} numberOfLines={6}>
        "{item.content}"
      </Text>
    </>
  );

  return (
    <View
      style={[
        styles.card,
        item.isPending && styles.pendingCard,
        style,
      ]}
      testID={testID}
    >
      {item.type === 'share_offer' && renderShareOffer()}
      {item.type === 'validate_empathy' && renderValidateEmpathy()}
      {item.type === 'context_received' && renderContextReceived()}
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
    borderLeftColor: colors.border,
  },
  pendingCard: {
    borderLeftColor: colors.accent,
  },
  heading: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
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
    color: '#fff',
  },
  validationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  validationButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  validationButtonNegative: {
    borderColor: colors.error,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  validationButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  validationButtonTextNeg: {
    color: colors.error,
  },
});

export default ReceivedItemCard;
