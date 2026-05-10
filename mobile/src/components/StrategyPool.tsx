/**
 * StrategyPool Component
 *
 * Displays the pool of strategies without author labels.
 * Users can request more AI-generated ideas or proceed to ranking.
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StrategyCard } from './StrategyCard';
import { appWidthStyle, useAppAppearance } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

interface StrategyPoolProps {
  /** List of strategies to display */
  strategies: Strategy[];
  /** Callback to request more AI suggestions */
  onRequestMore: () => void;
  /** Callback when user is ready to rank */
  onReady: () => void;
  /** Label for the readiness action */
  readyLabel?: string;
  /** Callback to close the overlay */
  onClose?: () => void;
  /** Whether AI is currently generating suggestions */
  isGenerating?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * StrategyPool displays all available strategies without author labels.
 *
 * Key features:
 * - Shows strategies unlabeled (no source indication)
 * - Allows requesting more AI-generated ideas
 * - Provides path to ranking phase
 */
export function StrategyPool({
  strategies,
  onRequestMore,
  onReady,
  readyLabel = 'These look good - rank my choices',
  onClose,
  isGenerating = false,
}: StrategyPoolProps) {
  const { palette } = useAppAppearance();
  const styles = makeStyles(palette);

  return (
    <View style={[styles.container, appWidthStyle]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Here is what we have come up with</Text>
            <Text style={styles.subtitle}>
              Strategies are grouped by idea. Some may name roles when safety or accountability needs that clarity.
            </Text>
          </View>
          {onClose && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close strategy pool"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {strategies.map((strategy) => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.moreButton, isGenerating && styles.moreButtonDisabled]}
          onPress={onRequestMore}
          disabled={isGenerating}
          accessibilityRole="button"
          accessibilityLabel={isGenerating ? 'Generating ideas' : 'Generate more ideas'}
          accessibilityState={{ disabled: isGenerating }}
        >
          <Text style={[styles.moreText, isGenerating && styles.moreTextDisabled]}>
            {isGenerating ? 'Generating...' : 'Generate more ideas'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.readyButton}
          onPress={onReady}
          accessibilityRole="button"
          accessibilityLabel={readyLabel}
        >
          <Text style={styles.readyText}>{readyLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

type Palette = ReturnType<typeof useAppAppearance>['palette'];

const TEXT_ON_ACCENT = '#0d0f12';

const makeStyles = (palette: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.bgPane,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: palette.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: palette.textMuted,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  actions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.bgElev,
  },
  moreButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  moreButtonDisabled: {
    backgroundColor: palette.chipBg,
  },
  moreText: {
    color: palette.accentText,
    fontSize: 14,
    fontWeight: '500',
  },
  moreTextDisabled: {
    color: palette.textFaint,
  },
  readyButton: {
    padding: 14,
    backgroundColor: palette.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  readyText: {
    color: TEXT_ON_ACCENT,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default StrategyPool;
