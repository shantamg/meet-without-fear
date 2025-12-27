/**
 * FeelHeardConfirmation Component
 *
 * Stage 1 gate confirmation asking if the user feels fully heard.
 * Allows continuing the conversation or confirming completion.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  buttons: {
    gap: 8,
  },
  continueButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  continueText: {
    color: '#374151',
    fontSize: 14,
  },
  confirmButton: {
    padding: 12,
    backgroundColor: '#10B981',
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
