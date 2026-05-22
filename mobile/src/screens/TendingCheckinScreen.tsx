import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import {
  ContinueChoice,
  PartialClosureResolution,
  SubmitTendingCheckinRequest,
  TendingBlockerCategory,
  TendingEntryDTO,
  TendingEntryScope,
  TendingEntryStatus,
  TendingFollowThroughStatus,
  TendingHelpfulnessStatus,
  TendingNeedResolutionStatus,
  TendingNextAction,
  TendingReminderScope,
} from '@meet-without-fear/shared';
import { colors } from '@/theme';

type Step = 'followThrough' | 'helpfulness' | 'needsReview' | 'whatComesNext';

const STEP_ORDER: Step[] = ['followThrough', 'helpfulness', 'needsReview', 'whatComesNext'];

const STEP_COPY: Record<Step, { title: string; subtitle: string }> = {
  followThrough: {
    title: 'What happened',
    subtitle: 'Check each commitment against what actually happened.',
  },
  helpfulness: {
    title: 'Did it help',
    subtitle: 'Name whether this helped the need, and what got in the way if not.',
  },
  needsReview: {
    title: 'Needs review',
    subtitle: 'Look at one underlying need at a time.',
  },
  whatComesNext: {
    title: 'What comes next',
    subtitle: 'Choose the path that fits what you learned.',
  },
};

const FOLLOW_THROUGH = [
  [TendingFollowThroughStatus.HAPPENED, 'Happened'],
  [TendingFollowThroughStatus.PARTLY_HAPPENED, 'Partly'],
  [TendingFollowThroughStatus.DID_NOT_HAPPEN, 'Did not happen'],
  [TendingFollowThroughStatus.NOT_SURE, 'Not sure'],
] as const;

const HELPFULNESS = [
  [TendingHelpfulnessStatus.HELPED, 'Helped'],
  [TendingHelpfulnessStatus.PARTLY_HELPED, 'Partly helped'],
  [TendingHelpfulnessStatus.DID_NOT_HELP, 'Did not help'],
  [TendingHelpfulnessStatus.NOT_SURE, 'Not sure'],
] as const;

const BLOCKERS = [
  [TendingBlockerCategory.FORGOT, 'Forgot'],
  [TendingBlockerCategory.TOO_HARD, 'Too hard'],
  [TendingBlockerCategory.TOO_FREQUENT, 'Too frequent'],
  [TendingBlockerCategory.UNCLEAR, 'Unclear'],
  [TendingBlockerCategory.PARTNER_DID_NOT_DO_PART, 'Partner part'],
  [TendingBlockerCategory.I_DID_NOT_DO_PART, 'My part'],
  [TendingBlockerCategory.CIRCUMSTANCES_CHANGED, 'Changed'],
  [TendingBlockerCategory.NO_LONGER_WANTED, 'No longer wanted'],
  [TendingBlockerCategory.OTHER, 'Other'],
] as const;

const NEED_STATUSES = [
  [TendingNeedResolutionStatus.RESOLVED, 'Resolved'],
  [TendingNeedResolutionStatus.IMPROVING, 'Improving'],
  [TendingNeedResolutionStatus.STILL_OPEN, 'Still open'],
  [TendingNeedResolutionStatus.CHANGED, 'Changed'],
  [TendingNeedResolutionStatus.NOT_SURE, 'Not sure'],
] as const;

const NEXT_CHOICES = [
  [ContinueChoice.FULL_CLOSURE, TendingNextAction.FULL_CLOSURE, 'Close fully'],
  [ContinueChoice.EXTEND, TendingNextAction.EXTEND, 'Keep going'],
  [ContinueChoice.EXTEND, TendingNextAction.ADJUST_COMMITMENT, 'Adjust'],
  [ContinueChoice.ANOTHER_ROUND, TendingNextAction.REOPEN_STRATEGY_WORK, 'Reopen strategy'],
  [ContinueChoice.NEW_PROCESS, TendingNextAction.NEW_PROCESS, 'New process'],
  [ContinueChoice.PARTIAL_CLOSURE, TendingNextAction.PARTIAL_CLOSURE, 'Partial closure'],
] as const;

export interface TendingCheckinNeed {
  id?: string | null;
  label: string;
  sourceUserId?: string | null;
}

export type TendingCheckinPayload = SubmitTendingCheckinRequest;

export interface TendingCheckinScreenProps {
  entries: TendingEntryDTO[];
  needs?: TendingCheckinNeed[];
  initialEntryId?: string | null;
  isSubmitting?: boolean;
  onSubmit: (payload: TendingCheckinPayload) => void;
  onCancel?: () => void;
}

function isRespondable(entry: TendingEntryDTO): boolean {
  return entry.status === TendingEntryStatus.OPEN || entry.status === TendingEntryStatus.PARTIAL;
}

function entryLabel(entry: TendingEntryDTO): string {
  return entry.summary ?? (entry.scope === TendingEntryScope.INDIVIDUAL ? 'Individual commitment' : 'Shared agreement');
}

export function TendingCheckinScreen({
  entries,
  needs = [],
  initialEntryId,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: TendingCheckinScreenProps) {
  const respondable = useMemo(() => {
    const open = entries.filter(isRespondable);
    if (!initialEntryId) return open;
    const selected = open.find((entry) => entry.id === initialEntryId);
    return selected ? [selected, ...open.filter((entry) => entry.id !== initialEntryId)] : open;
  }, [entries, initialEntryId]);
  const reviewNeeds = needs.length > 0
    ? needs
    : respondable.map((entry) => ({ id: entry.agreementId, label: entryLabel(entry) }));

  const [step, setStep] = useState<Step>('followThrough');
  const [followThrough, setFollowThrough] = useState<Record<string, TendingFollowThroughStatus>>({});
  const [whatHappened, setWhatHappened] = useState<Record<string, string>>({});
  const [helpfulness, setHelpfulness] = useState<Record<string, TendingHelpfulnessStatus>>({});
  const [blockers, setBlockers] = useState<Record<string, TendingBlockerCategory[]>>({});
  const [helpedNeed, setHelpedNeed] = useState<Record<string, string>>({});
  const [needStatuses, setNeedStatuses] = useState<Record<string, TendingNeedResolutionStatus>>({});
  const [needNotes, setNeedNotes] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<ContinueChoice>(ContinueChoice.EXTEND);
  const [nextAction, setNextAction] = useState<TendingNextAction>(TendingNextAction.EXTEND);
  const [partialClosure, setPartialClosure] = useState<Record<string, PartialClosureResolution>>({});
  const [privateReminder, setPrivateReminder] = useState(false);
  const [sharedReminder, setSharedReminder] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);
  const isLast = stepIndex === STEP_ORDER.length - 1;

  const goNext = () => {
    if (!isLast) {
      setStep(STEP_ORDER[stepIndex + 1]);
      return;
    }

    const entryOutcomes = respondable.map((entry) => ({
      tendingEntryId: entry.id,
      followThroughStatus: followThrough[entry.id] ?? TendingFollowThroughStatus.NOT_SURE,
      helpfulnessStatus: helpfulness[entry.id] ?? TendingHelpfulnessStatus.NOT_SURE,
      blockerCategories: blockers[entry.id] ?? [],
      whatHappened: whatHappened[entry.id]?.trim() || undefined,
      helpedNeed: helpedNeed[entry.id]?.trim() || undefined,
      stillWorthTrying: nextAction !== TendingNextAction.FULL_CLOSURE && nextAction !== TendingNextAction.NEW_PROCESS,
    }));
    const needOutcomes = reviewNeeds.map((need, index) => {
      const key = need.id ?? `${need.label}-${index}`;
      return {
        needId: need.id ?? undefined,
        needLabel: need.label,
        sourceUserId: 'sourceUserId' in need ? need.sourceUserId ?? undefined : undefined,
        resolutionStatus: needStatuses[key] ?? TendingNeedResolutionStatus.NOT_SURE,
        note: needNotes[key]?.trim() || undefined,
        nextAction,
      };
    });
    const reminderEntry = respondable[0];
    const reminderDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const reminders = [
      privateReminder && reminderEntry
        ? {
            tendingEntryId: reminderEntry.id,
            scope: TendingReminderScope.PRIVATE,
            remindAt: reminderDate,
            note: 'Private Tending reminder',
          }
        : null,
      sharedReminder && reminderEntry?.scope === TendingEntryScope.SHARED
        ? {
            tendingEntryId: reminderEntry.id,
            scope: TendingReminderScope.SHARED,
            remindAt: reminderDate,
            note: 'Shared Tending reminder',
          }
        : null,
    ].filter(Boolean) as NonNullable<SubmitTendingCheckinRequest['reminders']>;

    onSubmit({
      orientations: {
        whatWorked: {
          reflection: '',
          perEntryNotes: Object.fromEntries(
            Object.entries(whatHappened).filter(([, value]) => value.trim())
          ),
        },
        whereMoreSupport: {
          reflection: '',
          perEntryNotes: Object.fromEntries(
            Object.entries(helpedNeed).filter(([, value]) => value.trim())
          ),
        },
        whatComesNext: { continueChoice: choice, nextAction, partialClosure, reminders },
      },
      entryOutcomes,
      needOutcomes,
      reminders,
      nextAction,
    });
  };

  const goBack = () => {
    if (stepIndex === 0) {
      onCancel?.();
      return;
    }
    setStep(STEP_ORDER[stepIndex - 1]);
  };

  const toggleBlocker = (entryId: string, blocker: TendingBlockerCategory) => {
    const current = blockers[entryId] ?? [];
    setBlockers({
      ...blockers,
      [entryId]: current.includes(blocker)
        ? current.filter((item) => item !== blocker)
        : [...current, blocker],
    });
  };

  const renderChoice = <T extends string>(
    id: string,
    value: T,
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <TouchableOpacity
      key={`${id}-${value}`}
      style={[styles.toggleButton, selected && styles.toggleButtonSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={`${id}-${value}`}
    >
      <Text style={[styles.toggleText, selected && styles.toggleTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="tending-checkin-screen">
      <View style={styles.stepper}>
        {STEP_ORDER.map((s, i) => (
          <View key={s} style={[styles.stepDot, i === stepIndex && styles.stepDotActive]} testID={`tending-checkin-step-${s}`} />
        ))}
      </View>
      <Text style={styles.title}>{STEP_COPY[step].title}</Text>
      <Text style={styles.subtitle}>{STEP_COPY[step].subtitle}</Text>

      {step === 'followThrough' && respondable.map((entry) => (
        <View key={entry.id} style={styles.entryRow} testID={`tending-checkin-entry-${entry.id}`}>
          <Text style={styles.entryTitle}>{entryLabel(entry)}</Text>
          <View style={styles.toggleRow}>
            {FOLLOW_THROUGH.map(([value, label]) =>
              renderChoice(
                `tending-follow-through-${entry.id}`,
                value,
                label,
                (followThrough[entry.id] ?? TendingFollowThroughStatus.NOT_SURE) === value,
                () => setFollowThrough({ ...followThrough, [entry.id]: value })
              )
            )}
          </View>
          <TextInput
            value={whatHappened[entry.id] ?? ''}
            onChangeText={(text) => setWhatHappened({ ...whatHappened, [entry.id]: text })}
            placeholder="What actually happened?"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            multiline
            testID={`tending-what-happened-${entry.id}`}
          />
        </View>
      ))}

      {step === 'helpfulness' && respondable.map((entry) => (
        <View key={entry.id} style={styles.entryRow}>
          <Text style={styles.entryTitle}>{entryLabel(entry)}</Text>
          <View style={styles.toggleRow}>
            {HELPFULNESS.map(([value, label]) =>
              renderChoice(
                `tending-helpfulness-${entry.id}`,
                value,
                label,
                (helpfulness[entry.id] ?? TendingHelpfulnessStatus.NOT_SURE) === value,
                () => setHelpfulness({ ...helpfulness, [entry.id]: value })
              )
            )}
          </View>
          <View style={styles.toggleRow}>
            {BLOCKERS.map(([value, label]) =>
              renderChoice(
                `tending-blocker-${entry.id}`,
                value,
                label,
                (blockers[entry.id] ?? []).includes(value),
                () => toggleBlocker(entry.id, value)
              )
            )}
          </View>
          <TextInput
            value={helpedNeed[entry.id] ?? ''}
            onChangeText={(text) => setHelpedNeed({ ...helpedNeed, [entry.id]: text })}
            placeholder="Did it help the need it was meant to serve?"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            multiline
            testID={`tending-helped-need-${entry.id}`}
          />
        </View>
      ))}

      {step === 'needsReview' && reviewNeeds.map((need, index) => {
        const key = need.id ?? `${need.label}-${index}`;
        return (
          <View key={key} style={styles.entryRow} testID={`tending-need-${key}`}>
            <Text style={styles.entryTitle}>{need.label}</Text>
            <View style={styles.toggleRow}>
              {NEED_STATUSES.map(([value, label]) =>
                renderChoice(
                  `tending-need-resolution-${key}`,
                  value,
                  label,
                  (needStatuses[key] ?? TendingNeedResolutionStatus.NOT_SURE) === value,
                  () => setNeedStatuses({ ...needStatuses, [key]: value })
                )
              )}
            </View>
            <TextInput
              value={needNotes[key] ?? ''}
              onChangeText={(text) => setNeedNotes({ ...needNotes, [key]: text })}
              placeholder="What changed or remains open?"
              placeholderTextColor={colors.textMuted}
              style={styles.textInput}
              multiline
              testID={`tending-need-note-${key}`}
            />
          </View>
        );
      })}

      {step === 'whatComesNext' && (
        <View>
          {NEXT_CHOICES.map(([continueChoice, action, label]) => {
            const selected = choice === continueChoice && nextAction === action;
            return (
              <TouchableOpacity
                key={`${continueChoice}-${action}`}
                style={[styles.choiceCard, selected && styles.choiceCardSelected]}
                onPress={() => {
                  setChoice(continueChoice);
                  setNextAction(action);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`tending-checkin-choice-${action}`}
              >
                <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}

          {(nextAction === TendingNextAction.EXTEND || nextAction === TendingNextAction.ADJUST_COMMITMENT) && (
            <View style={styles.reminderBlock} testID="tending-reminder-controls">
              <Text style={styles.fieldLabel}>Reminder</Text>
              <TouchableOpacity
                style={[styles.toggleButton, privateReminder && styles.toggleButtonSelected]}
                onPress={() => setPrivateReminder(!privateReminder)}
                testID="tending-private-reminder"
              >
                <Text style={[styles.toggleText, privateReminder && styles.toggleTextSelected]}>Private reminder</Text>
              </TouchableOpacity>
              {respondable.some((entry) => entry.scope === TendingEntryScope.SHARED) && (
                <TouchableOpacity
                  style={[styles.toggleButton, sharedReminder && styles.toggleButtonSelected]}
                  onPress={() => setSharedReminder(!sharedReminder)}
                  testID="tending-shared-reminder"
                >
                  <Text style={[styles.toggleText, sharedReminder && styles.toggleTextSelected]}>Shared reminder</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {choice === ContinueChoice.PARTIAL_CLOSURE && (
            <View style={styles.partialClosureBlock} testID="tending-checkin-partial-closure">
              <Text style={styles.fieldLabel}>For each commitment</Text>
              {respondable.map((entry) => {
                const value = partialClosure[entry.id] ?? PartialClosureResolution.CONTINUING;
                return (
                  <View key={entry.id} style={styles.partialClosureRow}>
                    <Text style={styles.entryTitle}>{entryLabel(entry)}</Text>
                    <View style={styles.toggleRow}>
                      {([PartialClosureResolution.RESOLVED, PartialClosureResolution.CONTINUING] as const).map((r) =>
                        renderChoice(
                          `tending-checkin-resolution-${entry.id}`,
                          r,
                          r === PartialClosureResolution.RESOLVED ? 'Resolved' : 'Continuing',
                          value === r,
                          () => setPartialClosure({ ...partialClosure, [entry.id]: r })
                        )
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={goBack} accessibilityRole="button" testID="tending-checkin-back">
          <Text style={styles.secondaryButtonText}>{stepIndex === 0 ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, isSubmitting && styles.disabled]}
          onPress={goNext}
          disabled={isSubmitting}
          accessibilityRole="button"
          testID={isLast ? 'tending-checkin-submit' : 'tending-checkin-next'}
        >
          <Text style={styles.primaryButtonText}>{isLast ? (isSubmitting ? 'Submitting...' : 'Submit') : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, gap: 12 },
  stepper: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stepDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepDotActive: { backgroundColor: colors.accent },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 12 },
  entryRow: { gap: 8, marginBottom: 14 },
  entryTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  textInput: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
    padding: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  toggleButtonSelected: { borderColor: colors.accent, backgroundColor: colors.bgTertiary },
  toggleText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  toggleTextSelected: { color: colors.accent },
  choiceCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 8,
    backgroundColor: colors.bgSecondary,
  },
  choiceCardSelected: { borderColor: colors.accent, backgroundColor: colors.bgTertiary },
  choiceLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  choiceLabelSelected: { color: colors.accent },
  reminderBlock: { marginTop: 16, gap: 8 },
  partialClosureBlock: { marginTop: 16, gap: 12 },
  partialClosureRow: { gap: 6 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 16 },
  primaryButton: { flex: 1, borderRadius: 8, backgroundColor: colors.accent, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: colors.textOnAccent, fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});

export default TendingCheckinScreen;
