/**
 * PersonProfile Component
 *
 * Displays the person's profile information including avatar, name, and connection date.
 */

import { View, Text, StyleSheet } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface PersonProfileProps {
  /** Person's display name */
  name: string;
  /** Person's initials for avatar display */
  initials: string;
  /** When the connection was established (formatted string) */
  connectedSince: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * PersonProfile displays the person's profile section.
 *
 * Features:
 * - Large avatar with initials
 * - Name prominently displayed
 * - Connection date in neutral language
 */
export function PersonProfile({ name, initials, connectedSince }: PersonProfileProps) {
  return (
    <View style={styles.container} testID="person-profile">
      <View style={styles.avatar} accessibilityLabel={`Avatar for ${name}`}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.connected}>Connected since {connectedSince}</Text>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  initials: {
    fontSize: 28,
    fontWeight: '600',
    color: 'white',
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  connected: {
    fontSize: 14,
    color: '#6B7280',
  },
});

export default PersonProfile;
