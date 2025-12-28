/**
 * FeelHeardConfirmation Component
 *
 * Stage 1 gate confirmation asking if the user feels fully heard.
 * Allows continuing the conversation or confirming completion.
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
      <Text style={styles.question}>Do you feel fully heard?</Text>
      <Text style={styles.subtitle}>
        Take your time - there is no rush to move forward
      </Text>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueText}>Not yet, I have more to share</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmText}>Yes, I feel heard</Text>
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
    padding: 16,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  buttons: {
    gap: 8,
  },
  continueButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  continueText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  confirmButton: {
    padding: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default FeelHeardConfirmation;
