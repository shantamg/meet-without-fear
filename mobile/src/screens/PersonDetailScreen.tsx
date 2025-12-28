/**
 * PersonDetailScreen Component
 *
 * Displays person profile, active session status, and session history.
 * This is the presentational component used by the route handler.
 */

import { View, ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';

import { usePerson, usePastSessions } from '../hooks/usePerson';
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
  const { data: pastSessions = [], isLoading: sessionsLoading } = usePastSessions(personId);

  // Show nothing while loading
  if (personLoading || !person) {
    return null;
  }

  const activeSession = person.activeSession;

  const handleStartNewSession = () => {
    router.push(`/session/new?partnerId=${personId}`);
  };

  return (
    <ScrollView style={styles.container} testID="person-detail-screen">
      <PersonProfile
        name={person.name}
        initials={person.initials}
        connectedSince={person.connectedSince}
      />

      {activeSession ? (
        <CurrentSessionCard
          sessionId={activeSession.id}
          stage={activeSession.stage}
          status={activeSession.status}
          partnerName={person.name}
          lastUpdate={activeSession.lastUpdate}
        />
      ) : (
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
      )}

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
