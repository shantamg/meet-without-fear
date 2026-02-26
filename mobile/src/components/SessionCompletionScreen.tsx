/**
 * SessionCompletionScreen Component
 *
 * Shown as a full-screen early-return overlay when session.status === RESOLVED.
 * Follows the same pattern as SessionEntryMoodCheck and StrategyRanking overlays.
 *
 * Design philosophy: "warm gravity" — acknowledge the work, center the agreement,
 * don't celebrate or inflate. The screen should feel like the last page of a chapter.
 */

import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { AgreementSummaryCard } from './AgreementSummaryCard';

// ============================================================================
// Types
// ============================================================================

interface AgreementSummary {
  id: string;
  experiment: string;
  duration: string | null;
  measureOfSuccess: string | null;
  followUpDate: string | null;
}

interface SessionCompletionScreenProps {
  partnerName: string;
  agreements: AgreementSummary[];
  onViewHistory: () => void;
  onReturnToSessions: () => void;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SessionCompletionScreen({
  partnerName,
  agreements,
  onViewHistory,
  onReturnToSessions,
  testID = 'session-completion-screen',
}: SessionCompletionScreenProps) {
  const hasFollowUp = agreements.some((a) => a.followUpDate);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID={testID}
    >
      {/* Headline section */}
      <View style={styles.headerSection}>
        <Text style={styles.icon}>🤝</Text>
        <Text style={styles.headline}>A Path Forward</Text>
        <Text style={styles.subheading}>
          You and {partnerName} reached an agreement together
        </Text>
      </View>

      {/* Agreements section */}
      {agreements.length > 0 && (
        <View style={styles.agreementsSection}>
          <Text style={styles.sectionTitle}>
            {agreements.length === 1 ? 'Your Agreement' : 'Your Agreements'}
          </Text>
          {agreements.map((agreement) => (
            <AgreementSummaryCard
              key={agreement.id}
              experiment={agreement.experiment}
              duration={agreement.duration}
              measureOfSuccess={agreement.measureOfSuccess}
              followUpDate={agreement.followUpDate}
              testID={`agreement-summary-${agreement.id}`}
            />
          ))}
        </View>
      )}

      {/* Reminder note */}
      {hasFollowUp && (
        <Text style={styles.reminderNote}>
          A check-in date has been set. You can revisit this agreement anytime from your sessions list.
        </Text>
      )}

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onViewHistory}
          accessibilityRole="button"
          accessibilityLabel="View conversation history"
          testID="view-history-button"
        >
          <Text style={styles.secondaryButtonText}>View Conversation History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onReturnToSessions}
          accessibilityRole="button"
          accessibilityLabel="Return to sessions"
          testID="return-to-sessions-button"
        >
          <Text style={styles.primaryButtonText}>Return to Sessions</Text>
        </TouchableOpacity>
      </View>
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
    padding: 24,
    paddingTop: 40,
    paddingBottom: 48,
  },

  // Header
  headerSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  icon: {
    fontSize: 40,
    marginBottom: 16,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Agreements
  agreementsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Reminder
  reminderNote: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    fontStyle: 'italic',
  },

  // Actions
  actionsSection: {
    gap: 12,
    marginTop: 12,
  },
  secondaryButton: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    padding: 16,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
