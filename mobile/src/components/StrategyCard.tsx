/**
 * StrategyCard Component
 *
 * Displays a strategy without attribution, supporting selection and overlap states.
 * Strategies are intentionally shown unlabeled to focus on the ideas themselves.
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, Circle } from 'lucide-react-native';
import { useAppAppearance } from '@/theme';

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
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
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
            <Circle color={palette.textMuted} size={24} />
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
          <Check color={TEXT_ON_SUCCESS} size={16} />
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

type Palette = ReturnType<typeof useAppAppearance>['palette'];

const TEXT_ON_ACCENT = '#0d0f12';
const TEXT_ON_SUCCESS = '#ffffff';

const makeStyles = (palette: Palette) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: palette.infoSoft,
    borderRadius: 20,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: palette.info,
  },
  selectedCard: {
    borderColor: palette.success,
    backgroundColor: palette.successSoft,
  },
  overlapCard: {
    borderColor: palette.success,
    backgroundColor: palette.successSoft,
  },
  checkbox: {
    marginRight: 12,
    justifyContent: 'center',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    color: TEXT_ON_ACCENT,
    fontWeight: '600',
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  description: {
    fontSize: 16,
    color: palette.text,
    lineHeight: 22,
  },
  duration: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 4,
  },
  overlapBadge: {
    backgroundColor: palette.success,
    borderRadius: 12,
    padding: 4,
    alignSelf: 'center',
    marginLeft: 8,
  },
});

export default StrategyCard;
