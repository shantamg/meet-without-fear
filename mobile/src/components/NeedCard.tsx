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
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function NeedCard({
  need,
  onPress,
  style,
  testID,
}: NeedCardProps) {
  const cardContent = (
    <>
      <Text style={styles.category}>
        {need.category}
      </Text>
      <Text style={styles.description}>{need.description}</Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        testID={testID}
        accessibilityRole="button"
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, style]} testID={testID}>
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
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  description: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
});

export default NeedCard;
