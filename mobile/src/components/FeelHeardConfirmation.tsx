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
  isPending?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function FeelHeardConfirmation({
  onConfirm,
  isPending = false,
}: FeelHeardConfirmationProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={onConfirm}
        disabled={isPending}
        activeOpacity={0.7}
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
    backgroundColor: colors.brandBlue,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default FeelHeardConfirmation;
