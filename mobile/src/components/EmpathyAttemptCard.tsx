/**
 * EmpathyAttemptCard Component
 *
 * Displays an empathy attempt from either the user or their partner.
 * Used in Stage 2 Perspective Stretch for showing and validating empathy attempts.
 */

import { View, Text, StyleSheet, ViewStyle } from 'react-native';

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
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  partnerCard: {
    backgroundColor: '#EDE9FE',
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1F2937',
  },
});

export default EmpathyAttemptCard;
