/**
 * FeelHeardConfirmation Component
 *
 * Low-profile panel above chat input for Stage 1 gate confirmation.
 * Single button to confirm feeling heard.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface FeelHeardConfirmationProps {
  onConfirm: () => void;
  onContinue?: () => void;
  isPending?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function FeelHeardConfirmation({
  onConfirm,
  onContinue,
  isPending = false,
}: FeelHeardConfirmationProps) {
  return (
    <View style={styles.container}>
      {onContinue && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={onContinue}
          disabled={isPending}
          activeOpacity={0.7}
          testID="feel-heard-not-yet"
        >
          <Text style={styles.secondaryButtonText}>Not yet</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.button}
        onPress={onConfirm}
        disabled={isPending}
        activeOpacity={0.7}
        testID="feel-heard-yes"
      >
        <Text style={styles.buttonText}>I feel heard</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgb(20, 184, 166)', // Teal green to match "Felt Heard" indicator
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
});

export default FeelHeardConfirmation;
