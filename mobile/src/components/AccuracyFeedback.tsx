/**
 * AccuracyFeedback Component
 *
 * Allows users to provide feedback on how accurately their partner
 * understood their perspective. Used in Stage 2 validation phase.
 */

import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface AccuracyFeedbackProps {
  onAccurate: () => void;
  onPartiallyAccurate: () => void;
  onInaccurate: () => void;
  style?: ViewStyle;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function AccuracyFeedback({
  onAccurate,
  onPartiallyAccurate,
  onInaccurate,
  style,
  testID,
}: AccuracyFeedbackProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text style={styles.question}>How accurate is this?</Text>

      <TouchableOpacity
        style={styles.accurateButton}
        onPress={onAccurate}
        accessibilityRole="button"
        accessibilityLabel="This feels accurate"
      >
        <Text style={styles.accurateText}>This feels accurate</Text>
        <Text style={styles.subtext}>I feel understood</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.partialButton}
        onPress={onPartiallyAccurate}
        accessibilityRole="button"
        accessibilityLabel="Partially accurate"
      >
        <Text style={styles.partialText}>Partially accurate</Text>
        <Text style={styles.subtext}>Some parts are right, some need adjustment</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.inaccurateButton}
        onPress={onInaccurate}
        accessibilityRole="button"
        accessibilityLabel="This misses the mark"
      >
        <Text style={styles.inaccurateText}>This misses the mark</Text>
        <Text style={styles.subtext}>I want to provide feedback</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginHorizontal: 16,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1F2937',
  },
  accurateButton: {
    padding: 16,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    marginBottom: 8,
  },
  accurateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
  },
  partialButton: {
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginBottom: 8,
  },
  partialText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  inaccurateButton: {
    padding: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    marginBottom: 8,
  },
  inaccurateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
  },
  subtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});

export default AccuracyFeedback;
