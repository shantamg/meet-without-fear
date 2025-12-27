/**
 * CommonGroundCard Component
 *
 * Displays shared needs discovered between both partners.
 * Used in Stage 3 Need Mapping to highlight common ground.
 */

import { View, Text, StyleSheet, ViewStyle } from 'react-native';

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
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 16,
  },
  needRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  emoji: {
    fontSize: 20,
    marginRight: 12,
    color: '#10B981',
  },
  needContent: {
    flex: 1,
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  description: {
    fontSize: 14,
    color: '#374151',
    marginTop: 2,
    lineHeight: 20,
  },
  insightBox: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  insightText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#065F46',
    lineHeight: 20,
  },
});

export default CommonGroundCard;
