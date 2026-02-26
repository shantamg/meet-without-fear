/**
 * AgreementSummaryCard Component
 *
 * Read-only display of a confirmed agreement for the completion screen.
 * No edit/delete/confirm actions — just shows what was agreed.
 */

import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface AgreementSummaryCardProps {
  experiment: string;
  duration: string | null;
  measureOfSuccess: string | null;
  followUpDate: string | null;
  testID?: string;
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export function AgreementSummaryCard({
  experiment,
  duration,
  measureOfSuccess,
  followUpDate,
  testID = 'agreement-summary-card',
}: AgreementSummaryCardProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.experiment}>{experiment}</Text>

      {duration && (
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Duration</Text>
          <Text style={styles.detailValue}>{duration}</Text>
        </View>
      )}

      {measureOfSuccess && (
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Success Measure</Text>
          <Text style={styles.detailValue}>{measureOfSuccess}</Text>
        </View>
      )}

      {followUpDate && (
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Check-in</Text>
          <Text style={styles.detailValue}>{formatDate(followUpDate)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: 'rgba(16, 163, 127, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 163, 127, 0.3)',
    marginBottom: 12,
  },
  experiment: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
    fontWeight: '500',
  },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
