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
  /** Callback when user wants to use a matched strategy as a next step */
  onCreateAgreement?: (strategy: { id: string; description: string }) => void;
  /** Whether to disable the next-step button (max agreements reached) */
  disableCreate?: boolean;
  /** Strategy ids that already have a proposed or confirmed next step */
  existingAgreementStrategyIds?: string[];
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
 * - Frames overlap as a possible protocol, not a settled agreement
 * - Handles no-overlap case gracefully
 */
export function OverlapReveal({
  overlapping,
  uniqueToMe,
  uniqueToPartner,
  onCreateAgreement,
  disableCreate,
  existingAgreementStrategyIds = [],
}: OverlapRevealProps) {
  const hasOverlap = overlapping.length > 0;
  const hasUnique = uniqueToMe.length > 0 || uniqueToPartner.length > 0;
  const existingAgreementStrategyIdSet = new Set(existingAgreementStrategyIds);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Possible Shared Steps</Text>
        <Text style={styles.subtitle}>Both of you marked these as worth discussing.</Text>
      </View>

      {hasOverlap && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Both Marked Worth Discussing</Text>
          {overlapping.map((strategy) => {
            const hasExistingAgreement = existingAgreementStrategyIdSet.has(strategy.id);
            const createDisabled = disableCreate || hasExistingAgreement;

            return (
              <View key={strategy.id}>
                <StrategyCard strategy={strategy} isOverlap />
                {onCreateAgreement && !hasExistingAgreement && (
                  <>
                    <TouchableOpacity
                      style={[styles.createAgreementButton, createDisabled && styles.createAgreementButtonDisabled]}
                      onPress={() => !createDisabled && onCreateAgreement({ id: strategy.id, description: strategy.description })}
                      accessibilityRole="button"
                      accessibilityLabel={`Use as next step: ${strategy.description}`}
                      accessibilityState={{ disabled: createDisabled }}
                      testID="create-agreement-button"
                      disabled={createDisabled}
                    >
                      <Text style={[styles.createAgreementText, createDisabled && styles.createAgreementTextDisabled]}>Use as Next Step</Text>
                    </TouchableOpacity>
                    {disableCreate && (
                      <Text style={styles.maxAgreementsText}>You can choose up to 2 next steps per session.</Text>
                    )}
                  </>
                )}
                {hasExistingAgreement && (
                  <Text style={styles.existingAgreementText}>Next step already proposed.</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {hasUnique && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Different Preferences</Text>
          {[...uniqueToMe, ...uniqueToPartner].map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </View>
      )}

      {!hasOverlap && (
        <View style={styles.noOverlap}>
          <Text style={styles.noOverlapText}>
            No direct overlap yet. Return to chat to decide whether there is a smaller step,
            an individual commitment, or no shared next step for now.
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
  existingAgreementText: {
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
