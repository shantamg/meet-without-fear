/**
 * AgreementSummaryCard Component
 *
 * Read-only display of a confirmed agreement for the completion screen.
 * No edit/delete/confirm actions — just shows what was agreed.
 */

import { View, Text, StyleSheet } from 'react-native';
import { useAppAppearance } from '@/theme';

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
  const { palette, scheme } = useAppAppearance();
  const cardBg = scheme === 'dark' ? 'rgba(16, 163, 127, 0.1)' : 'rgba(16, 163, 127, 0.08)';
  const cardBorder = scheme === 'dark' ? 'rgba(16, 163, 127, 0.3)' : 'rgba(16, 163, 127, 0.35)';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
      testID={testID}
    >
      <Text style={[styles.experiment, { color: palette.text }]}>{experiment}</Text>

      {duration && (
        <View style={[styles.detail, { borderTopColor: palette.divider }]}>
          <Text style={[styles.detailLabel, { color: palette.textFaint }]}>Duration</Text>
          <Text style={[styles.detailValue, { color: palette.textMuted }]}>{duration}</Text>
        </View>
      )}

      {measureOfSuccess && (
        <View style={[styles.detail, { borderTopColor: palette.divider }]}>
          <Text style={[styles.detailLabel, { color: palette.textFaint }]}>Success Measure</Text>
          <Text style={[styles.detailValue, { color: palette.textMuted }]}>{measureOfSuccess}</Text>
        </View>
      )}

      {followUpDate && (
        <View style={[styles.detail, { borderTopColor: palette.divider }]}>
          <Text style={[styles.detailLabel, { color: palette.textFaint }]}>Check-in</Text>
          <Text style={[styles.detailValue, { color: palette.textMuted }]}>{formatDate(followUpDate)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  experiment: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
  },
});
