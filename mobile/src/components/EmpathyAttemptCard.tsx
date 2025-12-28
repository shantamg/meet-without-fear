/**
 * EmpathyAttemptCard Component
 *
 * Displays an empathy attempt from either the user or their partner.
 * Used in Stage 2 Perspective Stretch for showing and validating empathy attempts.
 */

import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface EmpathyAttemptCardProps {
  attempt: string;
  isPartner?: boolean;
  testID?: string;
  style?: ViewStyle;
}

// ============================================================================
// Component
// ============================================================================

export function EmpathyAttemptCard({
  attempt,
  isPartner = false,
  testID,
  style,
}: EmpathyAttemptCardProps) {
  return (
    <View
      style={[styles.card, isPartner && styles.partnerCard, style]}
      testID={testID}
    >
      <Text style={styles.label}>
        {isPartner ? "Partner's attempt to understand you" : 'Your empathy attempt'}
      </Text>
      <Text style={styles.content}>{attempt}</Text>
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
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partnerCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
});

export default EmpathyAttemptCard;
