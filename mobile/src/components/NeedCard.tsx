/**
 * NeedCard Component
 *
 * Displays a single identified need with category and description.
 * Used in Stage 3 Need Mapping for showing user needs.
 */

import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';

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
    backgroundColor: 'rgba(147, 197, 253, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    position: 'relative',
  },
  sharedCard: {
    backgroundColor: 'rgba(167, 243, 208, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(110, 231, 183, 0.5)',
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sharedCategory: {
    color: colors.success,
  },
  description: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  sharedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.success,
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
