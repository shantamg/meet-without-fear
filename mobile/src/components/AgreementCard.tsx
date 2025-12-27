/**
 * AgreementCard Component
 *
 * Displays a micro-experiment agreement for confirmation.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// ============================================================================
// Types
// ============================================================================

interface Agreement {
  experiment: string;
  duration: string;
  successMeasure: string;
  checkInDate?: string;
}

interface AgreementCardProps {
  /** The agreement details to display */
  agreement: Agreement;
  /** Callback when the agreement is confirmed */
  onConfirm: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * AgreementCard displays the final agreement for a micro-experiment.
 *
 * Key features:
 * - Shows experiment description
 * - Shows duration and success measure
 * - Shows optional check-in date
 * - Provides confirmation button
 */
export function AgreementCard({ agreement, onConfirm }: AgreementCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Micro-Experiment Agreement</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Experiment</Text>
        <Text style={styles.value}>{agreement.experiment}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>{agreement.duration}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Success Measure</Text>
        <Text style={styles.value}>{agreement.successMeasure}</Text>
      </View>

      {agreement.checkInDate && (
        <View style={styles.field}>
          <Text style={styles.label}>Check-in Scheduled</Text>
          <Text style={styles.value}>{agreement.checkInDate}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.confirmButton}
        onPress={onConfirm}
        accessibilityRole="button"
        accessibilityLabel="Confirm Agreement"
      >
        <Text style={styles.confirmText}>Confirm Agreement</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 20,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 20,
    textAlign: 'center',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 22,
  },
  confirmButton: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#10B981',
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AgreementCard;
