/**
 * SessionCompletionScreen Component
 *
 * Shown as a full-screen early-return overlay when session.status === RESOLVED.
 * Follows the same pattern as SessionEntryMoodCheck.
 *
 * Design philosophy: "warm gravity" — acknowledge the work, center the agreement,
 * don't celebrate or inflate. The screen should feel like the last page of a chapter.
 */

import { ReactNode } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppAppearance } from '@/theme';
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

interface IndividualCommitmentSummary {
  id: string;
  description: string;
}

interface OpenNeedSummary {
  id: string;
  label: string;
}

interface SessionCompletionScreenProps {
  partnerName: string;
  agreements: AgreementSummary[];
  individualCommitments?: IndividualCommitmentSummary[];
  openNeeds?: OpenNeedSummary[];
  tendingPanel?: ReactNode;
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
  individualCommitments = [],
  openNeeds = [],
  tendingPanel,
  onViewHistory,
  onReturnToSessions,
  testID = 'session-completion-screen',
}: SessionCompletionScreenProps) {
  const { palette } = useAppAppearance();
  const hasFollowUp = agreements.some((a) => a.followUpDate);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.content}
      testID={testID}
    >
      {/* Headline section */}
      <View style={styles.headerSection}>
        <Text style={styles.icon}>🤝</Text>
        <Text style={[styles.headline, { color: palette.text }]}>A Path Forward</Text>
        <Text style={[styles.subheading, { color: palette.textMuted }]}>
          You and {partnerName} identified a limited next step. This does not have to mean everything is resolved.
        </Text>
      </View>

      {/* Shared experiments */}
      <View style={styles.agreementsSection} testID="shared-experiments-section">
        <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>Shared experiments</Text>
        {agreements.length === 0 ? (
          <Text style={[styles.emptyPlaceholder, { color: palette.textFaint }]}>—</Text>
        ) : (
          agreements.map((agreement) => (
            <AgreementSummaryCard
              key={agreement.id}
              experiment={agreement.experiment}
              duration={agreement.duration}
              measureOfSuccess={agreement.measureOfSuccess}
              followUpDate={agreement.followUpDate}
              testID={`agreement-summary-${agreement.id}`}
            />
          ))
        )}
      </View>

      {/* Individual commitments */}
      <View style={styles.agreementsSection} testID="individual-commitments-section">
        <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>Individual commitments</Text>
        {individualCommitments.length === 0 ? (
          <Text style={[styles.emptyPlaceholder, { color: palette.textFaint }]}>—</Text>
        ) : (
          individualCommitments.map((commitment) => (
            <View
              key={commitment.id}
              style={styles.bulletRow}
              testID={`individual-commitment-${commitment.id}`}
            >
              <Text style={[styles.bulletText, { color: palette.text }]}>{commitment.description}</Text>
            </View>
          ))
        )}
      </View>

      {/* Named but not addressed */}
      <View style={styles.agreementsSection} testID="open-needs-section">
        <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>Named but not addressed</Text>
        {openNeeds.length === 0 ? (
          <Text style={[styles.emptyPlaceholder, { color: palette.textFaint }]}>—</Text>
        ) : (
          openNeeds.map((need) => (
            <View key={need.id} style={styles.bulletRow} testID={`open-need-${need.id}`}>
              <Text style={[styles.bulletText, { color: palette.text }]}>{need.label}</Text>
            </View>
          ))
        )}
        <Text style={[styles.openNeedsCopy, { color: palette.textFaint }]}>
          These remain on record. Not a failure — just yours to hold beyond this.
        </Text>
      </View>

      {/* Reminder note */}
      {hasFollowUp && (
        <Text style={[styles.reminderNote, { color: palette.textFaint }]}>
          A check-in date has been set. You can revisit this agreement anytime from your sessions list.
        </Text>
      )}

      {tendingPanel && (
        <View style={styles.tendingSection}>
          {tendingPanel}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: palette.border }]}
          onPress={onViewHistory}
          accessibilityRole="button"
          accessibilityLabel="View conversation history"
          testID="view-history-button"
        >
          <Text style={[styles.secondaryButtonText, { color: palette.textMuted }]}>View Conversation History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: palette.accent }]}
          onPress={onReturnToSessions}
          accessibilityRole="button"
          accessibilityLabel="Return to sessions"
          testID="return-to-sessions-button"
        >
          <Text style={[styles.primaryButtonText, { color: palette.textOnAccent }]}>Return to Sessions</Text>
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
    textAlign: 'center',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  emptyPlaceholder: {
    fontSize: 15,
    paddingVertical: 4,
  },
  bulletRow: {
    paddingVertical: 6,
  },
  bulletText: {
    fontSize: 15,
    lineHeight: 22,
  },
  openNeedsCopy: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 18,
  },

  // Reminder
  reminderNote: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  tendingSection: {
    marginBottom: 24,
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
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
