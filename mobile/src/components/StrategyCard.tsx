/**
 * StrategyCard Component
 *
 * Displays a strategy without attribution, supporting selection and overlap states.
 * Strategies are intentionally shown unlabeled to focus on the ideas themselves.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, Circle } from 'lucide-react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

interface StrategyCardProps {
  /** The strategy data to display */
  strategy: Strategy;
  /** Whether this strategy is selected */
  selected?: boolean;
  /** The rank number if selected (1-based) */
  rank?: number;
  /** Callback when the card is pressed for selection */
  onSelect?: () => void;
  /** Whether this strategy is a shared overlap between both partners */
  isOverlap?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * StrategyCard displays a strategy option.
 *
 * Key design decisions:
 * - NO attribution shown (no "you suggested" or "partner suggested")
 * - Supports selectable mode for ranking
 * - Supports overlap highlighting for reveal phase
 * - Shows rank number when selected
 */
export function StrategyCard({
  strategy,
  selected,
  rank,
  onSelect,
  isOverlap,
}: StrategyCardProps) {
  const isSelectable = !!onSelect;

  const cardContent = (
    <>
      {isSelectable && (
        <View style={styles.checkbox}>
          {selected ? (
            <View style={styles.selectedIndicator}>
              <Text style={styles.rankNumber}>{rank}</Text>
            </View>
          ) : (
            <Circle color={colors.textSecondary} size={24} />
          )}
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.description}>{strategy.description}</Text>
        {strategy.duration && (
          <Text style={styles.duration}>{strategy.duration}</Text>
        )}
      </View>

      {isOverlap && (
        <View testID="overlap-badge" style={styles.overlapBadge}>
          <Check color="white" size={16} />
        </View>
      )}
    </>
  );

  if (isSelectable) {
    return (
      <TouchableOpacity
        testID={`strategy-card-${strategy.id}`}
        style={[
          styles.card,
          selected && styles.selectedCard,
          isOverlap && styles.overlapCard,
        ]}
        onPress={onSelect}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={strategy.description}
        accessibilityState={{ selected }}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[styles.card, isOverlap && styles.overlapCard]}
      accessibilityRole="text"
      accessibilityLabel={strategy.description}
    >
      {cardContent}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: 'rgba(147, 197, 253, 0.15)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(147, 197, 253, 0.3)',
  },
  selectedCard: {
    borderColor: 'rgba(110, 231, 183, 0.5)',
    backgroundColor: 'rgba(110, 231, 183, 0.2)',
  },
  overlapCard: {
    borderColor: colors.success,
    backgroundColor: 'rgba(16, 163, 127, 0.15)',
  },
  checkbox: {
    marginRight: 12,
    justifyContent: 'center',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    color: colors.textOnAccent,
    fontWeight: '600',
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  description: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  duration: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  overlapBadge: {
    backgroundColor: colors.success,
    borderRadius: 12,
    padding: 4,
    alignSelf: 'center',
    marginLeft: 8,
  },
});

export default StrategyCard;
