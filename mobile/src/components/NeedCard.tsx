/**
 * NeedCard Component
 *
 * Displays a single identified need with category and description.
 * Used in Stage 3 Need Mapping for showing user needs.
 */

import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface Need {
  category: string;
  description: string;
}

interface NeedCardProps {
  need: Need;
  isShared?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function NeedCard({
  need,
  isShared = false,
  onPress,
  style,
  testID,
}: NeedCardProps) {
  const cardStyle = [styles.card, isShared && styles.sharedCard, style];

  const cardContent = (
    <>
      <Text style={[styles.category, isShared && styles.sharedCategory]}>
        {need.category}
      </Text>
      <Text style={styles.description}>{need.description}</Text>
      {isShared && (
        <View style={styles.sharedBadge}>
          <Text style={styles.sharedBadgeText}>Shared</Text>
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        testID={testID}
        accessibilityRole="button"
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} testID={testID}>
      {cardContent}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    position: 'relative',
  },
  sharedCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 4,
  },
  sharedCategory: {
    color: '#065F46',
  },
  description: {
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 22,
  },
  sharedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sharedBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default NeedCard;
