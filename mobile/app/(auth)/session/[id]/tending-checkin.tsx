import { useMemo } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ContinueChoice } from '@meet-without-fear/shared';
import { TendingCheckinScreen, TendingCheckinPayload } from '@/src/screens/TendingCheckinScreen';
import { useTendingEntries, useSubmitTendingCheckin } from '@/src/hooks';
import { colors } from '@/src/theme';

/**
 * Stage 4 Phase 5 — Tending check-in route.
 *
 * Hosts the three-orientation TendingCheckinScreen and handles post-submission
 * routing per the chosen forward path.
 */
export default function TendingCheckinRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === 'string' ? id : '';
  const entriesQuery = useTendingEntries(sessionId || undefined);
  const submit = useSubmitTendingCheckin();

  const entries = useMemo(() => entriesQuery.data?.entries ?? [], [entriesQuery.data]);

  const handleSubmit = (payload: TendingCheckinPayload) => {
    submit.mutate(
      {
        sessionId,
        orientations: payload,
      },
      {
        onSuccess: (data) => {
          switch (data.continueChoice) {
            case ContinueChoice.ANOTHER_ROUND:
              router.replace(`/session/${sessionId}`);
              break;
            case ContinueChoice.NEW_PROCESS:
              if (data.newSessionId) {
                router.replace(`/session/${data.newSessionId}`);
              } else {
                router.replace(`/session/${sessionId}`);
              }
              break;
            case ContinueChoice.EXTEND: {
              const when = data.nextScheduledFor
                ? new Date(data.nextScheduledFor).toLocaleDateString()
                : 'soon';
              Alert.alert('Check-in scheduled', `Next check-in: ${when}`, [
                { text: 'OK', onPress: () => router.replace(`/session/${sessionId}`) },
              ]);
              break;
            }
            case ContinueChoice.PARTIAL_CLOSURE: {
              const when = data.nextScheduledFor
                ? new Date(data.nextScheduledFor).toLocaleDateString()
                : 'soon';
              Alert.alert('Partial closure', `Continuing entries next check-in: ${when}`, [
                { text: 'OK', onPress: () => router.replace(`/session/${sessionId}`) },
              ]);
              break;
            }
            case ContinueChoice.FULL_CLOSURE:
              Alert.alert(
                'Wrapped',
                "This is wrapped. Whatever you've named here stays on record.",
                [{ text: 'OK', onPress: () => router.replace(`/session/${sessionId}`) }]
              );
              break;
          }
        },
        onError: (error) => {
          Alert.alert('Could not submit', error.message ?? 'Please try again.');
        },
      }
    );
  };

  if (entriesQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading check-in…</Text>
      </View>
    );
  }

  if (!sessionId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Session not found.</Text>
      </View>
    );
  }

  return (
    <TendingCheckinScreen
      entries={entries}
      isSubmitting={submit.isPending}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  muted: { color: colors.textMuted, fontSize: 14 },
});
