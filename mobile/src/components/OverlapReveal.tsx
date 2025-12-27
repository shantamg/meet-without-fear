/**
 * OverlapReveal Component
 *
 * Reveals the strategies that both partners chose (overlap)
 * and shows unique selections from each side.
 */

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StrategyCard } from './StrategyCard';

// ============================================================================
// Types
// ============================================================================

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

interface OverlapRevealProps {
  /** Strategies both partners selected */
  overlapping: Strategy[];
  /** Strategies only the current user selected */
  uniqueToMe: Strategy[];
  /** Strategies only the partner selected */
  uniqueToPartner: Strategy[];
}

// ============================================================================
// Component
// ============================================================================

/**
 * OverlapReveal shows the results of both partners' rankings.
 *
 * Key features:
 * - Highlights shared choices (overlap)
 * - Shows unique selections without judgment
 * - Provides positive messaging for common ground
 * - Handles no-overlap case gracefully
 */
export function OverlapReveal({
  overlapping,
  uniqueToMe,
  uniqueToPartner,
}: OverlapRevealProps) {
  const hasOverlap = overlapping.length > 0;
  const hasUnique = uniqueToMe.length > 0 || uniqueToPartner.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Shared Priorities</Text>
        <Text style={styles.subtitle}>Common ground found!</Text>
      </View>

      {hasOverlap && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>You Both Chose</Text>
          {overlapping.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} isOverlap />
          ))}
        </View>
      )}

      {hasUnique && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Only One of You Chose</Text>
          {[...uniqueToMe, ...uniqueToPartner].map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </View>
      )}

      {!hasOverlap && (
        <View style={styles.noOverlap}>
          <Text style={styles.noOverlapText}>
            No direct overlap yet - but that is okay! Let us explore your
            different preferences.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  header: {
    padding: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#065F46',
  },
  subtitle: {
    fontSize: 14,
    color: '#10B981',
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#374151',
  },
  noOverlap: {
    padding: 24,
    alignItems: 'center',
  },
  noOverlapText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default OverlapReveal;
