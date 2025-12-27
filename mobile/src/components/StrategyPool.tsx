/**
 * StrategyPool Component
 *
 * Displays the pool of strategies without attribution.
 * Users can request more AI-generated ideas or proceed to ranking.
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StrategyCard } from './StrategyCard';

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
  isGenerating = false,
}: StrategyPoolProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Here is what we have come up with</Text>
        <Text style={styles.subtitle}>
          Strategies are shown without attribution - focus on the ideas
        </Text>
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
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
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
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  moreButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  moreButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  moreText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '500',
  },
  moreTextDisabled: {
    color: '#9CA3AF',
  },
  readyButton: {
    padding: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  readyText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default StrategyPool;
