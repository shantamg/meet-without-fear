/**
 * PastSessionCard Component
 *
 * Displays a completed session with date and topic for the session history list.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle } from 'lucide-react-native';

// ============================================================================
// Types
// ============================================================================

interface PastSessionCardProps {
  /** Session ID for navigation */
  sessionId: string;
  /** Date when session was resolved (formatted string) */
  date: string;
  /** Brief topic or description of what the session was about */
  topic: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * PastSessionCard displays a completed session in the history list.
 *
 * Features:
 * - Check icon indicating resolved status
 * - Date and topic display
 * - Navigates to session review on press
 */
export function PastSessionCard({ sessionId, date, topic }: PastSessionCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/session/${sessionId}/review`);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Past session: ${topic}, ${date}`}
      accessibilityHint="Tap to view session review"
      testID="past-session-card"
    >
      <CheckCircle color="#10B981" size={20} />
      <View style={styles.content}>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.topic}>{topic}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  content: {
    marginLeft: 12,
    flex: 1,
  },
  date: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  topic: {
    fontSize: 16,
    color: '#1F2937',
  },
});

export default PastSessionCard;
