/**
 * PersonDetailScreen Component
 *
 * Displays person profile, active session status, and session history.
 * This is the presentational component used by the route handler.
 */

import { View, ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Clock, Send } from 'lucide-react-native';

import { usePerson, usePastSessions } from '../hooks/usePerson';
import { useResendInvitation } from '../hooks/useSessions';
import { colors } from '@/theme';
import { PersonProfile } from '../components/PersonProfile';
import { CurrentSessionCard } from '../components/CurrentSessionCard';
import { PastSessionCard } from '../components/PastSessionCard';

// ============================================================================
// Types
// ============================================================================

interface PersonDetailScreenProps {
  /** The person ID to display */
  personId: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * PersonDetailScreen displays the full person detail view.
 *
 * Features:
 * - Profile section with avatar and connection info
 * - Current session card with status and continue action
 * - Start new session button when no active session
 * - Past sessions list with navigation to review
 */
export function PersonDetailScreen({ personId }: PersonDetailScreenProps) {
  const router = useRouter();
  const { data: person, isLoading: personLoading } = usePerson(personId);
  const { data: pastSessions = [] } = usePastSessions(personId);
  const resendInvitation = useResendInvitation();

  // Show nothing while loading
  if (personLoading || !person) {
    return null;
  }

  const activeSession = person.activeSession;
  const pendingInvitation = person.pendingInvitation;

  const handleStartNewSession = () => {
    router.push(`/session/new?partnerId=${personId}`);
  };

  const handleResendInvitation = () => {
    if (pendingInvitation) {
      resendInvitation.mutate({ invitationId: pendingInvitation.id });
    }
  };

  // Render the main content section based on state
  const renderSessionSection = () => {
    // State 1: Active session exists
    if (activeSession) {
      return (
        <CurrentSessionCard
          sessionId={activeSession.id}
          stage={activeSession.stage}
          status={activeSession.status}
          partnerName={person.name}
          lastUpdate={activeSession.lastUpdate}
        />
      );
    }

    // State 3: Pending invitation
    if (pendingInvitation) {
      return (
        <View style={styles.pendingCard} testID="pending-invitation-card">
          <View style={styles.pendingHeader}>
            <Clock color={colors.warning} size={24} />
            <Text style={styles.pendingTitle}>Invitation Sent</Text>
          </View>
          <Text style={styles.pendingMessage}>
            Waiting for {person.name} to respond
          </Text>
          <Text style={styles.pendingTime}>
            Sent {formatTimeSince(pendingInvitation.sentAt)}
          </Text>
          <TouchableOpacity
            style={[
              styles.resendButton,
              resendInvitation.isPending && styles.resendButtonDisabled,
            ]}
            onPress={handleResendInvitation}
            disabled={resendInvitation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Resend invitation"
            testID="resend-invitation-button"
          >
            <Send color={colors.textPrimary} size={18} />
            <Text style={styles.resendButtonText}>
              {resendInvitation.isPending ? 'Sending...' : 'Resend Invitation'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // State 2: No active session, no pending invitation
    return (
      <TouchableOpacity
        style={styles.newSessionButton}
        onPress={handleStartNewSession}
        accessibilityRole="button"
        accessibilityLabel="Start new session"
        testID="start-new-session-button"
      >
        <Plus color="white" size={20} />
        <Text style={styles.newSessionText}>Start New Session</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} testID="person-detail-screen">
      <PersonProfile
        name={person.name}
        initials={person.initials}
        connectedSince={person.connectedSince}
      />

      {renderSessionSection()}

      <View style={styles.pastSection}>
        <Text style={styles.pastTitle}>Past Sessions</Text>

        {pastSessions.length > 0 ? (
          pastSessions.map((session) => (
            <PastSessionCard
              key={session.id}
              sessionId={session.id}
              date={session.date}
              topic={session.topic}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>No past sessions yet</Text>
        )}
      </View>
    </ScrollView>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format time since a date into a human-readable string
 */
function formatTimeSince(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  newSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: colors.accent,
    borderRadius: 12,
  },
  newSessionText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Pending invitation styles
  pendingCard: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pendingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.warning,
    marginLeft: 8,
  },
  pendingMessage: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  pendingTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: colors.bgTertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resendButtonDisabled: {
    opacity: 0.6,
  },
  resendButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Past sessions styles
  pastSection: {
    padding: 16,
  },
  pastTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
  },
});

export default PersonDetailScreen;
