/**
 * ConsentPrompt Component
 *
 * Asks for explicit consent before sharing sensitive information.
 * Used in Stage 2 before sharing empathy attempts and Stage 3 before sharing needs.
 */

import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface ConsentPromptProps {
  title: string;
  description: string;
  onConsent: () => void;
  onDecline: () => void;
  consentLabel?: string;
  declineLabel?: string;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ConsentPrompt({
  title,
  description,
  onConsent,
  onDecline,
  consentLabel = 'Yes, share this',
  declineLabel = 'Not yet',
  style,
  testID,
}: ConsentPromptProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.declineButton}
          onPress={onDecline}
          accessibilityRole="button"
        >
          <Text style={styles.declineText}>{declineLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.consentButton}
          onPress={onConsent}
          accessibilityRole="button"
        >
          <Text style={styles.consentText}>{consentLabel}</Text>
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
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1F2937',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  declineText: {
    color: '#374151',
    fontSize: 14,
  },
  consentButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  consentText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ConsentPrompt;
