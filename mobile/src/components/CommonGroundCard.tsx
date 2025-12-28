/**
 * CommonGroundCard Component
 *
 * Displays shared needs discovered between both partners.
 * Used in Stage 3 Need Mapping to highlight common ground.
 */

import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface SharedNeed {
  category: string;
  description: string;
}

interface CommonGroundCardProps {
  sharedNeeds: SharedNeed[];
  insight?: string;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CommonGroundCard({
  sharedNeeds,
  insight,
  style,
  testID,
}: CommonGroundCardProps) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      <Text style={styles.title}>Shared Needs Discovered</Text>

      {sharedNeeds.map((need, index) => (
        <View key={index} style={styles.needRow}>
          <Text style={styles.emoji}>*</Text>
          <View style={styles.needContent}>
            <Text style={styles.category}>{need.category}</Text>
            <Text style={styles.description}>{need.description}</Text>
          </View>
        </View>
      ))}

      {insight && (
        <View style={styles.insightBox} testID="insight-box">
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(167, 243, 208, 0.15)',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.4)',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  needRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  emoji: {
    fontSize: 20,
    marginRight: 12,
    color: colors.success,
  },
  needContent: {
    flex: 1,
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  insightBox: {
    backgroundColor: 'rgba(167, 243, 208, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    alignSelf: 'stretch',
  },
  insightText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 20,
    textAlign: 'center',
  },
});

export default CommonGroundCard;
