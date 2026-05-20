/**
 * NeedCard Component
 *
 * Displays a single identified need with category and description.
 * Used in Stage 3 Need Mapping for showing user needs.
 */

import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useAppAppearance } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface Need {
  id?: string;
  category: string;
  description: string;
  need?: string;
  warning?: string;
  status?: 'draft' | 'locked' | 'superseded' | 'deleted';
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
  const { palette } = useAppAppearance();
  const styles = makeStyles(palette);

  const cardContent = (
    <>
      <Text style={styles.category}>
        {need.category}
      </Text>
      <Text
        style={[
          styles.description,
          need.status === 'superseded' && styles.supersededText,
          need.status === 'deleted' && styles.deletedText,
        ]}
      >
        {need.description || need.need}
      </Text>
      {need.status === 'locked' && <Text style={styles.badge}>Locked</Text>}
      {need.status === 'superseded' && <Text style={styles.badge}>Refined ↓</Text>}
      {need.status === 'deleted' && <Text style={[styles.badge, styles.deletedBadge]}>Removed</Text>}
      {need.warning && (
        <Text style={styles.warning}>{need.warning}</Text>
      )}
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

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  card: {
    backgroundColor: palette.infoSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.info,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    position: 'relative',
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textMuted,
    marginBottom: 4,
  },
  description: {
    fontSize: 16,
    color: palette.text,
    lineHeight: 22,
  },
  supersededText: {
    opacity: 0.55,
  },
  deletedText: {
    opacity: 0.55,
    textDecorationLine: 'line-through',
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: palette.bgElev,
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  deletedBadge: {
    color: palette.danger,
  },
  warning: {
    marginTop: 10,
    color: palette.warning,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});

export default NeedCard;
