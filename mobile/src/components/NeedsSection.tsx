/**
 * NeedsSection Component
 *
 * Displays a titled section of needs with optional shared needs highlighting.
 * Used in Stage 3 Need Mapping for organizing and displaying needs.
 */

import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { NeedCard } from './NeedCard';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface Need {
  id: string;
  category: string;
  description: string;
}

interface NeedsSectionProps {
  title: string;
  needs: Need[];
  sharedNeeds?: string[]; // IDs of shared needs
  onNeedPress?: (needId: string) => void;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function NeedsSection({
  title,
  needs,
  sharedNeeds = [],
  onNeedPress,
  style,
  testID,
}: NeedsSectionProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      {needs.map((need) => (
        <NeedCard
          key={need.id}
          need={need}
          isShared={sharedNeeds.includes(need.id)}
          onPress={onNeedPress ? () => onNeedPress(need.id) : undefined}
          testID={`need-${need.id}`}
        />
      ))}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
});

export default NeedsSection;
