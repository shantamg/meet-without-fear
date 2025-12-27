/**
 * StrategyRanking Component
 *
 * Private ranking interface for selecting top strategy choices.
 * Rankings are not visible to partner until both submit.
 */

import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useState, useCallback } from 'react';
import { StrategyCard } from './StrategyCard';

// ============================================================================
// Types
// ============================================================================

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

interface StrategyRankingProps {
  /** List of strategies to rank */
  strategies: Strategy[];
  /** Callback when rankings are submitted */
  onSubmit: (rankedIds: string[]) => void;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_SELECTIONS = 3;

// ============================================================================
// Component
// ============================================================================

/**
 * StrategyRanking allows users to privately select and rank their top choices.
 *
 * Key features:
 * - Private selection (partner cannot see until both submit)
 * - Maximum of 3 selections
 * - Order of selection determines rank
 * - Can deselect to change choices
 */
export function StrategyRanking({ strategies, onSubmit }: StrategyRankingProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        // Deselect
        return prev.filter((s) => s !== id);
      }
      if (prev.length < MAX_SELECTIONS) {
        // Select
        return [...prev, id];
      }
      // Already at max, don't add
      return prev;
    });
  }, []);

  const getRank = useCallback(
    (id: string): number | undefined => {
      const index = selectedIds.indexOf(id);
      return index >= 0 ? index + 1 : undefined;
    },
    [selectedIds]
  );

  const handleSubmit = useCallback(() => {
    if (selectedIds.length > 0) {
      onSubmit(selectedIds);
    }
  }, [selectedIds, onSubmit]);

  const isSubmitDisabled = selectedIds.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rank Your Top Choices</Text>
        <Text style={styles.subtitle}>
          Select up to 3 options - your partner will not see your picks until you
          both submit
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            selected={selectedIds.includes(strategy.id)}
            rank={getRank(strategy.id)}
            onSelect={() => toggleSelection(strategy.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.count}>
          {selectedIds.length}/{MAX_SELECTIONS} selected
        </Text>
        <TouchableOpacity
          style={[styles.submitButton, isSubmitDisabled && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitDisabled}
          accessibilityRole="button"
          accessibilityLabel="Submit my ranking"
          accessibilityState={{ disabled: isSubmitDisabled }}
        >
          <Text
            style={[styles.submitText, isSubmitDisabled && styles.submitTextDisabled]}
          >
            Submit my ranking
          </Text>
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
    backgroundColor: '#FEF3C7',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  count: {
    textAlign: 'center',
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  submitButton: {
    padding: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  submitTextDisabled: {
    color: '#E5E7EB',
  },
});

export default StrategyRanking;
