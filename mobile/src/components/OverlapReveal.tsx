/**
 * OverlapReveal Component
 *
 * Reveals the strategies that both partners chose (overlap)
 * and shows unique selections from each side.
 */

import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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

interface OverlapRevealProps {
  /** Strategies both partners selected */
  overlapping: Strategy[];
  /** Strategies only the current user selected */
  uniqueToMe: Strategy[];
  /** Strategies only the partner selected */
  uniqueToPartner: Strategy[];
  /** Callback when user wants to create an agreement from a matched strategy */
  onCreateAgreement?: (strategy: { id: string; description: string }) => void;
  /** Whether to disable the Create Agreement button (max agreements reached) */
  disableCreate?: boolean;
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
  onCreateAgreement,
  disableCreate,
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
            <View key={strategy.id}>
              <StrategyCard strategy={strategy} isOverlap />
              {onCreateAgreement && (
                <>
                  <TouchableOpacity
                    style={[styles.createAgreementButton, disableCreate && styles.createAgreementButtonDisabled]}
                    onPress={() => !disableCreate && onCreateAgreement({ id: strategy.id, description: strategy.description })}
                    accessibilityRole="button"
                    accessibilityLabel={`Create agreement from strategy: ${strategy.description}`}
                    accessibilityState={{ disabled: disableCreate }}
                    testID="create-agreement-button"
                    disabled={disableCreate}
                  >
                    <Text style={[styles.createAgreementText, disableCreate && styles.createAgreementTextDisabled]}>Create Agreement</Text>
                  </TouchableOpacity>
                  {disableCreate && (
                    <Text style={styles.maxAgreementsText}>You can create up to 2 agreements per session.</Text>
                  )}
                </>
              )}
            </View>
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
    backgroundColor: colors.bgPrimary,
  },
  content: {
    flexGrow: 1,
  },
  header: {
    padding: 16,
    backgroundColor: 'rgba(16, 163, 127, 0.15)',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.success,
    marginTop: 4,
  },
  section: {
    padding: 16,
    backgroundColor: colors.bgSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.textPrimary,
  },
  createAgreementButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  createAgreementText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  createAgreementButtonDisabled: {
    opacity: 0.4,
  },
  createAgreementTextDisabled: {
    opacity: 0.8,
  },
  maxAgreementsText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
    marginTop: -4,
  },
  noOverlap: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  noOverlapText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default OverlapReveal;
