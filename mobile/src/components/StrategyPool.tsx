/**
 * StrategyPool Component
 *
 * Displays the pool of strategies without attribution.
 * Users can request more AI-generated ideas or proceed to ranking.
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StrategyCard } from './StrategyCard';
import { colors } from '@/theme';

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
  /** Callback to close the overlay */
  onClose?: () => void;
  /** Whether AI is currently generating suggestions */
  isGenerating?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * StrategyPool displays all available strategies without attribution.
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
  onClose,
  isGenerating = false,
}: StrategyPoolProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Here is what we have come up with</Text>
            <Text style={styles.subtitle}>
              Strategies are shown without attribution - focus on the ideas
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
          accessibilityLabel="These look good - rank my choices"
        >
          <Text style={styles.readyText}>These look good - rank my choices</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    backgroundColor: colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
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
    borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  moreButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  moreButtonDisabled: {
    backgroundColor: colors.bgTertiary,
  },
  moreText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  moreTextDisabled: {
    color: colors.textMuted,
  },
  readyButton: {
    padding: 14,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  readyText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default StrategyPool;
