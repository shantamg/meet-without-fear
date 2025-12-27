/**
 * WaitingRoom Component
 *
 * Displayed when waiting for the partner to complete a stage gate.
 * Shows a friendly message and optional partner name.
 */

import { View, Text, StyleSheet } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface WaitingRoomProps {
  message: string;
  partnerName?: string;
}

// ============================================================================
// Component
// ============================================================================

export function WaitingRoom({ message, partnerName }: WaitingRoomProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer} testID="waiting-indicator">
        <Text style={styles.icon}>&#8987;</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
      {partnerName && (
        <Text style={styles.partner}>
          Waiting for {partnerName} to complete this step
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
    color: '#4F46E5',
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  partner: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});

export default WaitingRoom;
