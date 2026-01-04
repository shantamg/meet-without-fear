/**
 * FeelHeardConfirmation Component
 *
 * Compact inline banner for Stage 1 gate confirmation.
 * Asks if user feels heard and allows continuing or confirming.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface FeelHeardConfirmationProps {
  onConfirm: () => void;
  onContinue: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function FeelHeardConfirmation({
  onConfirm,
  onContinue,
}: FeelHeardConfirmationProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.question}>Feeling heard?</Text>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueText}>Not yet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmText}>Yes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  question: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  continueButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
  },
  continueText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  confirmButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.accent,
    borderRadius: 6,
  },
  confirmText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default FeelHeardConfirmation;
