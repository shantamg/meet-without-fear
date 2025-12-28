/**
 * CompactTerms Component
 *
 * Displays the Curiosity Compact commitments and understandings
 * that users agree to before starting a session.
 */

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Constants
// ============================================================================

const COMPACT_COMMITMENTS = [
  'Approach this process with curiosity rather than certainty',
  'Allow the AI to guide the pace of our work',
  'Share honestly within my private space',
  'Consider the other\'s perspective when presented',
  'Focus on understanding needs rather than winning arguments',
  'Take breaks when emotions run high',
];

const COMPACT_UNDERSTANDING = [
  'The AI will not judge who is right or wrong',
  'My raw thoughts remain private unless I consent to share',
  'Progress requires both parties to complete each stage',
  'I can pause at any time but cannot skip ahead',
];

// ============================================================================
// Component
// ============================================================================

export function CompactTerms() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>I commit to:</Text>
      {COMPACT_COMMITMENTS.map((item, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.bullet}>-</Text>
          <Text style={styles.itemText}>{item}</Text>
        </View>
      ))}

      <Text style={[styles.sectionTitle, styles.secondSection]}>I understand that:</Text>
      {COMPACT_UNDERSTANDING.map((item, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.bullet}>-</Text>
          <Text style={styles.itemText}>{item}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.textSecondary,
  },
  secondSection: {
    marginTop: 24,
  },
  item: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    width: 20,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});

export default CompactTerms;
