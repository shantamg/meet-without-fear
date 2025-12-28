/**
 * PersonProfile Component
 *
 * Displays the person's profile information including avatar, name, and connection date.
 */

import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';

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
    borderBottomColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#7159c1',
  },
  initials: {
    fontSize: 28,
    fontWeight: '600',
    color: '#ffffff',
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  connected: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});

export default PersonProfile;
