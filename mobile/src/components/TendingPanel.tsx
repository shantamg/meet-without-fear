import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { CalendarClock, CheckCircle2, RotateCcw } from 'lucide-react-native';
import {
  AgreementDTO,
  Stage4OutcomeDTO,
  TendingBetweenPeriodNoteDTO,
  TendingCoordinationCycleDTO,
  TendingCoordinationStatus,
  TendingEntryDTO,
  TendingEntryScope,
  TendingEntryStatus,
  TendingEntryType,
  TendingHistoryCycleDTO,
} from '@meet-without-fear/shared';
import { useAppAppearance } from '@/theme';

type Palette = ReturnType<typeof useAppAppearance>['palette'];

interface TendingPanelProps {
  entries: TendingEntryDTO[];
  coordinationCycles?: TendingCoordinationCycleDTO[];
  betweenPeriodNotes?: TendingBetweenPeriodNoteDTO[];
  historyCycles?: TendingHistoryCycleDTO[];
  agreements?: AgreementDTO[];
  outcome?: Stage4OutcomeDTO | null;
  initialEntryId?: string | null;
  isCreatingReentry?: boolean;
  isCreatingBetweenPeriodNote?: boolean;
  isSubmittingResponse?: boolean;
  currentUserId?: string;
  isUpdatingShare?: boolean;
  onCreateReentry: (intent?: string) => void;
  onCreateBetweenPeriodNote?: (content: string) => void;
  onStartCheckin?: (entryId?: string) => void;
  /** @deprecated Legacy one-entry review path is kept only for compatibility during mobile cutover. */
  onSubmitResponse?: (
    entryId: string,
    response: {
      status: string;
      reflection?: string;
      continueChoice: string;
    }
  ) => void;
  onToggleShare?: (entryId: string, nextOptedInShared: boolean) => void;
}

function formatDate(value: string | null): string {
  if (!value) return 'Available now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function parseSummaryLines(summary: string): Array<{ label: string; items: string[] }> {
  const sections: Array<{ label: string; items: string[] }> = [];
  for (const line of summary.split('\n')) {
    if (!line || line === 'Passive Tending re-entry context.') continue;

    let label: string;
    let value: string;

    if (line.startsWith('Stage 4 closed as ')) {
      label = 'Closure';
      const colonIdx = line.indexOf(': ', 'Stage 4 closed as '.length);
      value = colonIdx >= 0 ? line.slice(colonIdx + 2) : line;
    } else {
      const colonIdx = line.indexOf(': ');
      if (colonIdx < 0) continue;
      label = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 2);
    }

    const items = value.includes('; ') ? value.split('; ') : [value];
    sections.push({ label, items });
  }
  return sections;
}

function entryTitle(entry: TendingEntryDTO): string {
  if (entry.type === TendingEntryType.USER_INITIATED_REENTRY) {
    return 'Passive re-entry';
  }
  if (entry.scope === TendingEntryScope.INDIVIDUAL) {
    return 'Individual commitment check-in';
  }
  return 'Agreement check-in';
}

function entryScopeLabel(entry: TendingEntryDTO): string {
  if (entry.type === TendingEntryType.USER_INITIATED_REENTRY) return 'Re-entry';
  return entry.scope === TendingEntryScope.INDIVIDUAL ? 'Individual' : 'Shared';
}

function entryStatusLabel(status: TendingEntryStatus): string {
  switch (status) {
    case TendingEntryStatus.SCHEDULED:
      return 'Scheduled';
    case TendingEntryStatus.OPEN:
      return 'Open';
    case TendingEntryStatus.PARTIAL:
      return 'Waiting for partner';
    case TendingEntryStatus.COMPLETED:
      return 'Completed';
    case TendingEntryStatus.EXPIRED:
      return 'Expired';
    case TendingEntryStatus.CANCELLED:
      return 'Cancelled';
    default:
      return status;
  }
}

function canRespond(entry: TendingEntryDTO): boolean {
  return (
    !entry.myResponse &&
    (entry.status === TendingEntryStatus.OPEN || entry.status === TendingEntryStatus.PARTIAL)
  );
}

export function TendingPanel({
  entries,
  coordinationCycles = [],
  betweenPeriodNotes = [],
  historyCycles = [],
  agreements = [],
  outcome,
  initialEntryId,
  isCreatingReentry = false,
  isCreatingBetweenPeriodNote = false,
  isSubmittingResponse = false,
  currentUserId,
  isUpdatingShare = false,
  onCreateReentry,
  onCreateBetweenPeriodNote,
  onStartCheckin,
  onToggleShare,
}: TendingPanelProps) {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [intent, setIntent] = useState('');
  const [betweenPeriodNote, setBetweenPeriodNote] = useState('');

  const selectedEntry = useMemo(() => {
    const byId = initialEntryId
      ? entries.find((entry) => entry.id === initialEntryId)
      : undefined;
    return (
      byId ||
      entries.find((entry) => canRespond(entry)) ||
      entries.find((entry) => entry.status === TendingEntryStatus.SCHEDULED) ||
      entries[0]
    );
  }, [entries, initialEntryId]);

  const selectedAgreement = agreements.find(
    (agreement) => agreement.id === selectedEntry?.agreementId
  );
  const selectedCoordinationCycle = selectedEntry
    ? coordinationCycles.find((cycle) => cycle.entryIds.includes(selectedEntry.id))
    : undefined;
  const scheduledSharedEntries = entries.filter(
    (entry) => entry.type === TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN
  );
  const passiveEntries = entries.filter(
    (entry) => entry.type === TendingEntryType.USER_INITIATED_REENTRY
  );
  const hasSharedAgreementCheckIn = scheduledSharedEntries.length > 0;
  const latestHistory = historyCycles[0];

  const handleCreateReentry = () => {
    if (isCreatingReentry) return;
    onCreateReentry(intent.trim() || undefined);
    setIntent('');
  };
  const handleCreateBetweenPeriodNote = () => {
    const content = betweenPeriodNote.trim();
    if (!content || isCreatingBetweenPeriodNote) return;
    onCreateBetweenPeriodNote?.(content);
    setBetweenPeriodNote('');
  };

  return (
    <View style={styles.container} testID="tending-panel">
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <RotateCcw color={palette.accent} size={18} />
          </View>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>The Tending</Text>
            <Text style={styles.subtitle}>
              Return to what was agreed, what stayed open, or what you want to revisit.
            </Text>
          </View>
        </View>
      </View>

      {selectedEntry && (
        <View style={styles.card}>
          <View style={styles.entryHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.scopeRow}>
                <Text style={styles.sectionTitle}>{entryTitle(selectedEntry)}</Text>
                <View
                  style={[
                    styles.scopeChip,
                    selectedEntry.scope === TendingEntryScope.INDIVIDUAL && styles.scopeChipIndividual,
                  ]}
                  testID={`tending-scope-chip-${selectedEntry.scope}`}
                >
                  <Text style={styles.scopeChipText}>{entryScopeLabel(selectedEntry)}</Text>
                </View>
              </View>
              <Text style={styles.entryMeta}>
                {entryStatusLabel(selectedEntry.status)} · {formatDate(selectedEntry.scheduledFor || selectedEntry.openedAt)}
              </Text>
              {selectedEntry.scope === TendingEntryScope.INDIVIDUAL &&
                currentUserId &&
                selectedEntry.ownerUserId === currentUserId &&
                onToggleShare && (
                  <TouchableOpacity
                    style={[styles.shareToggle, isUpdatingShare && styles.disabledButton]}
                    onPress={() =>
                      onToggleShare(selectedEntry.id, !selectedEntry.optedInShared)
                    }
                    disabled={isUpdatingShare}
                    accessibilityRole="button"
                    accessibilityLabel={
                      selectedEntry.optedInShared
                        ? 'Keep this individual commitment private'
                        : 'Share this individual commitment with your partner'
                    }
                    testID="tending-share-toggle"
                  >
                    <Text style={styles.shareToggleText}>
                      {selectedEntry.optedInShared
                        ? 'Keep private'
                        : 'Share with partner'}
                    </Text>
                  </TouchableOpacity>
                )}
            </View>
            {selectedEntry.myResponse && <CheckCircle2 color={palette.success} size={20} />}
          </View>

          {selectedAgreement && (
            <View style={styles.contextBox}>
              <Text style={styles.contextLabel}>Agreement</Text>
              <Text style={styles.contextText}>{selectedAgreement.description}</Text>
              {selectedAgreement.measureOfSuccess && (
                <Text style={styles.contextMeta}>Success: {selectedAgreement.measureOfSuccess}</Text>
              )}
            </View>
          )}

          {selectedEntry.summary &&
            parseSummaryLines(selectedEntry.summary).map((section, i) => (
              <View key={i} style={styles.contextBox}>
                <Text style={styles.contextLabel}>{section.label}</Text>
                {section.items.map((item, j) => (
                  <Text key={j} style={styles.contextText}>
                    {section.items.length > 1 ? `\u2022 ${item}` : item}
                  </Text>
                ))}
              </View>
            ))}

          {selectedCoordinationCycle && (
            <View style={styles.coordinationBox} testID="tending-coordination-status">
              <Text style={styles.contextLabel}>
                {selectedCoordinationCycle.status === TendingCoordinationStatus.WAITING_FOR_PARTNER
                  ? 'Held privately'
                  : 'Coordination'}
              </Text>
              <Text style={styles.contextText}>
                {selectedCoordinationCycle.status === TendingCoordinationStatus.WAITING_FOR_PARTNER
                  ? `Your check-in is saved. We'll hold shared choices privately until your partner completes their side or the response window closes on ${formatDate(selectedCoordinationCycle.responseDeadlineAt)}.`
                  : selectedCoordinationCycle.resultSummary || 'The shared check-in has a coordination update.'}
              </Text>
            </View>
          )}

          {canRespond(selectedEntry) ? (
            <View style={styles.responseArea}>
              <TouchableOpacity
                style={[styles.primaryButton, isSubmittingResponse && styles.disabledButton]}
                onPress={() => onStartCheckin?.(selectedEntry.id)}
                disabled={isSubmittingResponse}
                accessibilityRole="button"
                accessibilityLabel="Start Tending check-in"
                testID="start-tending-checkin"
              >
                <Text style={styles.primaryButtonText}>
                  {isSubmittingResponse ? 'Opening...' : 'Start check-in'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.mutedText}>
              {selectedEntry.myResponse
                ? 'Your review is saved.'
                : 'This check-in is not open for review yet.'}
            </Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.entryHeader}>
          <View>
            <Text style={styles.sectionTitle}>Latest record</Text>
            <Text style={styles.entryMeta}>
              {latestHistory ? formatDate(latestHistory.submittedAt) : 'No check-in recorded yet'}
            </Text>
          </View>
        </View>
        {latestHistory ? (
          <View style={styles.contextBox} testID="tending-history-summary">
            <Text style={styles.contextText}>
              {latestHistory.entryReviews.length > 0
                ? latestHistory.entryReviews.map((review) =>
                    `${review.summary ?? 'Tending entry'}: ${review.followThroughStatus}`
                  ).join('\n')
                : latestHistory.reflectionSummary ?? 'A Tending check-in was recorded.'}
            </Text>
            {latestHistory.needOutcomes.length > 0 && (
              <Text style={styles.contextMeta}>
                Needs: {latestHistory.needOutcomes.map((need) => `${need.needLabel} ${need.resolutionStatus}`).join('; ')}
              </Text>
            )}
            {latestHistory.adjustments.length > 0 && (
              <Text style={styles.contextMeta}>
                Adjusted: {latestHistory.adjustments.map((adjustment) =>
                  adjustment.revisedCommitmentText || adjustment.revisedCadence || 'commitment'
                ).join('; ')}
              </Text>
            )}
            {latestHistory.reminders.length > 0 && (
              <Text style={styles.contextMeta}>
                Next reminder: {formatDate(latestHistory.reminders[0].remindAt)}
              </Text>
            )}
            {latestHistory.coordinationSummary && (
              <Text style={styles.contextMeta}>{latestHistory.coordinationSummary}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.mutedText}>Your completed check-ins will appear here.</Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.entryHeader}>
          <View>
            <Text style={styles.sectionTitle}>Private notes</Text>
            <Text style={styles.entryMeta}>
              {betweenPeriodNotes.length > 0
                ? `${betweenPeriodNotes.length} saved for you`
                : 'Saved only for your check-in context'}
            </Text>
          </View>
        </View>
        {betweenPeriodNotes.slice(-3).map((note) => (
          <View key={note.id} style={styles.contextBox} testID={`tending-between-note-${note.id}`}>
            <Text style={styles.contextText}>{note.content}</Text>
            {note.carryForwardSelected && (
              <Text style={styles.contextMeta}>Selected for check-in</Text>
            )}
          </View>
        ))}
        {onCreateBetweenPeriodNote && (
          <>
            <TextInput
              value={betweenPeriodNote}
              onChangeText={setBetweenPeriodNote}
              placeholder="Private note for your future check-in"
              placeholderTextColor={palette.textFaint}
              multiline
              style={styles.textInput}
              accessibilityLabel="Private Tending note"
              testID="tending-between-note-input"
            />
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                (!betweenPeriodNote.trim() || isCreatingBetweenPeriodNote) && styles.disabledButton,
              ]}
              onPress={handleCreateBetweenPeriodNote}
              disabled={!betweenPeriodNote.trim() || isCreatingBetweenPeriodNote}
              accessibilityRole="button"
              accessibilityLabel="Save private Tending note"
              testID="create-tending-between-note"
            >
              <Text style={styles.secondaryButtonText}>
                {isCreatingBetweenPeriodNote ? 'Saving...' : 'Save private note'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.entryHeader}>
          <View>
            <Text style={styles.sectionTitle}>Passive re-entry</Text>
            <Text style={styles.entryMeta}>
              {hasSharedAgreementCheckIn
                ? `${scheduledSharedEntries.length} scheduled check-in${scheduledSharedEntries.length === 1 ? '' : 's'}`
                : 'No scheduled shared check-in'}
              {passiveEntries.length > 0 ? ` · ${passiveEntries.length} re-entry ${passiveEntries.length === 1 ? 'thread' : 'threads'}` : ''}
            </Text>
          </View>
          <CalendarClock color={palette.textMuted} size={20} />
        </View>

        {outcome?.individualCommitments.length ? (
          <View style={styles.contextBox}>
            <Text style={styles.contextLabel}>Individual commitments</Text>
            {outcome.individualCommitments.map((commitment) => (
              <Text key={commitment.id} style={styles.contextText}>
                {commitment.description}
              </Text>
            ))}
          </View>
        ) : null}

        {outcome?.openNeeds.length ? (
          <View style={styles.contextBox}>
            <Text style={styles.contextLabel}>Still open</Text>
            {outcome.openNeeds.map((need, index) => (
              <Text key={need.id || `${need.label}-${index}`} style={styles.contextText}>
                {need.label}
              </Text>
            ))}
          </View>
        ) : null}

        <TextInput
          value={intent}
          onChangeText={setIntent}
          placeholder="What do you want to revisit?"
          placeholderTextColor={palette.textFaint}
          multiline
          style={styles.textInput}
          accessibilityLabel="Passive re-entry intent"
        />
        <TouchableOpacity
          style={[styles.secondaryButton, isCreatingReentry && styles.disabledButton]}
          onPress={handleCreateReentry}
          disabled={isCreatingReentry}
          accessibilityRole="button"
          accessibilityLabel="Start passive Tending re-entry"
          testID="create-tending-reentry"
        >
          <Text style={styles.secondaryButtonText}>
            {isCreatingReentry ? 'Opening...' : 'Start re-entry'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    container: {
      gap: 12,
    },
    card: {
      backgroundColor: palette.bgElev,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 16,
    },
    titleRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    titleIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: palette.bgPane,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleCopy: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: palette.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: palette.textMuted,
      lineHeight: 20,
    },
    entryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: palette.text,
      marginBottom: 4,
    },
    entryMeta: {
      fontSize: 12,
      color: palette.textFaint,
      lineHeight: 17,
    },
    contextBox: {
      backgroundColor: palette.bg,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    coordinationBox: {
      backgroundColor: palette.bgPane,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: palette.accent,
    },
    contextLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.textFaint,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    contextText: {
      fontSize: 14,
      color: palette.text,
      lineHeight: 20,
      marginBottom: 4,
    },
    contextMeta: {
      fontSize: 13,
      color: palette.textMuted,
      lineHeight: 18,
      marginTop: 4,
    },
    responseArea: {
      gap: 10,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.textMuted,
    },
    choiceWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    choiceButton: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: palette.bg,
    },
    choiceButtonSelected: {
      borderColor: palette.accent,
      backgroundColor: palette.bgPane,
    },
    choiceText: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.textMuted,
    },
    choiceTextSelected: {
      color: palette.accent,
    },
    textInput: {
      minHeight: 78,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bg,
      color: palette.text,
      padding: 12,
      fontSize: 14,
      textAlignVertical: 'top',
    },
    primaryButton: {
      borderRadius: 8,
      backgroundColor: palette.accent,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: palette.textOnAccent,
      fontSize: 14,
      fontWeight: '700',
    },
    secondaryButton: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.accent,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    secondaryButtonText: {
      color: palette.accent,
      fontSize: 14,
      fontWeight: '700',
    },
    disabledButton: {
      opacity: 0.6,
    },
    mutedText: {
      fontSize: 13,
      color: palette.textFaint,
      lineHeight: 18,
    },
    scopeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    scopeChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: palette.bgPane,
      borderWidth: 1,
      borderColor: palette.border,
    },
    scopeChipIndividual: {
      backgroundColor: palette.bg,
      borderColor: palette.accent,
    },
    scopeChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.textMuted,
      textTransform: 'uppercase',
    },
    shareToggle: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.accent,
      backgroundColor: palette.bg,
    },
    shareToggleText: {
      color: palette.accent,
      fontSize: 12,
      fontWeight: '700',
    },
  });

export default TendingPanel;
