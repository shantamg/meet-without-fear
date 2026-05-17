import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import {
  ContinueChoice,
  PartialClosureResolution,
  TendingEntryDTO,
  TendingEntryScope,
  TendingEntryStatus,
} from '@meet-without-fear/shared';
import { colors } from '@/theme';

/**
 * Stage 4 Phase 5 — Three-orientation Tending check-in.
 *
 * Sequential step navigation (back/next). Non-sequential navigation is the gold
 * spec; this is documented as a follow-up in the phase plan.
 */
type Step = 'whatWorked' | 'whereMoreSupport' | 'whatComesNext';

const STEP_ORDER: Step[] = ['whatWorked', 'whereMoreSupport', 'whatComesNext'];

const PROMPTS: Record<Step, { title: string; subtitle: string; placeholder: string }> = {
  whatWorked: {
    title: 'What worked',
    subtitle:
      "Take a moment with each of these — what shifted, even a little? Wins worth naming, however small.",
    placeholder: 'A win worth naming…',
  },
  whereMoreSupport: {
    title: 'Where would more support help',
    subtitle: "What's still feeling hard or stuck? No judgment — just naming it.",
    placeholder: 'What still needs support…',
  },
  whatComesNext: {
    title: 'What comes next',
    subtitle: 'Where would you like to take it from here?',
    placeholder: '',
  },
};

const CHOICE_LABELS: Record<ContinueChoice, { label: string; subtitle: string }> = {
  [ContinueChoice.ANOTHER_ROUND]: {
    label: 'Try another round',
    subtitle: "New experiments grounded in what you've learned",
  },
  [ContinueChoice.EXTEND]: {
    label: 'Keep going',
    subtitle: 'Current experiments still feel right — extend for another check-in',
  },
  [ContinueChoice.NEW_PROCESS]: {
    label: 'Start a new process',
    subtitle: 'Something significant shifted — start fresh from Stage 1',
  },
  [ContinueChoice.PARTIAL_CLOSURE]: {
    label: 'Close some, continue others',
    subtitle: 'Mark each agreement individually',
  },
  [ContinueChoice.FULL_CLOSURE]: {
    label: 'Close fully',
    subtitle: "You're ready to wrap this up",
  },
};

const CHOICE_ORDER: ContinueChoice[] = [
  ContinueChoice.ANOTHER_ROUND,
  ContinueChoice.EXTEND,
  ContinueChoice.NEW_PROCESS,
  ContinueChoice.PARTIAL_CLOSURE,
  ContinueChoice.FULL_CLOSURE,
];

export interface TendingCheckinPayload {
  whatWorked: { reflection: string; perEntryNotes: Record<string, string> };
  whereMoreSupport: { reflection: string; perEntryNotes: Record<string, string> };
  whatComesNext: {
    continueChoice: ContinueChoice;
    partialClosure: Record<string, PartialClosureResolution>;
  };
}

export interface TendingCheckinScreenProps {
  entries: TendingEntryDTO[];
  isSubmitting?: boolean;
  onSubmit: (payload: TendingCheckinPayload) => void;
  onCancel?: () => void;
}

function isRespondable(entry: TendingEntryDTO, currentUserId?: string): boolean {
  if (entry.status !== TendingEntryStatus.OPEN && entry.status !== TendingEntryStatus.PARTIAL) {
    return false;
  }
  if (entry.scope === TendingEntryScope.INDIVIDUAL && currentUserId && entry.ownerUserId !== currentUserId) {
    return false;
  }
  return true;
}

export function TendingCheckinScreen({
  entries,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: TendingCheckinScreenProps) {
  const respondable = useMemo(() => entries.filter((e) => isRespondable(e)), [entries]);

  const [step, setStep] = useState<Step>('whatWorked');
  const [whatWorked, setWhatWorked] = useState({ reflection: '', perEntryNotes: {} as Record<string, string> });
  const [whereMore, setWhereMore] = useState({ reflection: '', perEntryNotes: {} as Record<string, string> });
  const [choice, setChoice] = useState<ContinueChoice>(ContinueChoice.EXTEND);
  const [partialClosure, setPartialClosure] = useState<Record<string, PartialClosureResolution>>({});

  const stepIndex = STEP_ORDER.indexOf(step);
  const isLast = stepIndex === STEP_ORDER.length - 1;

  const goNext = () => {
    if (isLast) {
      onSubmit({
        whatWorked,
        whereMoreSupport: whereMore,
        whatComesNext: { continueChoice: choice, partialClosure },
      });
      return;
    }
    setStep(STEP_ORDER[stepIndex + 1]);
  };

  const goBack = () => {
    if (stepIndex === 0) {
      onCancel?.();
      return;
    }
    setStep(STEP_ORDER[stepIndex - 1]);
  };

  const renderEntryNotes = (
    current: { reflection: string; perEntryNotes: Record<string, string> },
    setCurrent: typeof setWhatWorked,
    placeholder: string
  ) => (
    <>
      {respondable.map((entry) => (
        <View key={entry.id} style={styles.entryRow} testID={`tending-checkin-entry-${entry.id}`}>
          <Text style={styles.entryTitle}>{entry.summary ?? 'Tending entry'}</Text>
          <TextInput
            value={current.perEntryNotes[entry.id] ?? ''}
            onChangeText={(text) =>
              setCurrent({
                ...current,
                perEntryNotes: { ...current.perEntryNotes, [entry.id]: text },
              })
            }
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            multiline
            accessibilityLabel={`Note for ${entry.summary ?? entry.id}`}
          />
        </View>
      ))}
      <Text style={styles.fieldLabel}>Overall reflection</Text>
      <TextInput
        value={current.reflection}
        onChangeText={(text) => setCurrent({ ...current, reflection: text })}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.textInput, styles.reflectionInput]}
        multiline
        accessibilityLabel="Overall reflection"
        testID="tending-checkin-reflection"
      />
    </>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="tending-checkin-screen">
      <View style={styles.stepper}>
        {STEP_ORDER.map((s, i) => (
          <View
            key={s}
            style={[styles.stepDot, i === stepIndex && styles.stepDotActive]}
            testID={`tending-checkin-step-${s}`}
          />
        ))}
      </View>
      <Text style={styles.title}>{PROMPTS[step].title}</Text>
      <Text style={styles.subtitle}>{PROMPTS[step].subtitle}</Text>

      {step === 'whatWorked' && renderEntryNotes(whatWorked, setWhatWorked, PROMPTS.whatWorked.placeholder)}
      {step === 'whereMoreSupport' &&
        renderEntryNotes(whereMore, setWhereMore, PROMPTS.whereMoreSupport.placeholder)}

      {step === 'whatComesNext' && (
        <View>
          {CHOICE_ORDER.map((c) => {
            const selected = c === choice;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.choiceCard, selected && styles.choiceCardSelected]}
                onPress={() => setChoice(c)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`tending-checkin-choice-${c}`}
              >
                <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
                  {CHOICE_LABELS[c].label}
                </Text>
                <Text style={styles.choiceSubtitle}>{CHOICE_LABELS[c].subtitle}</Text>
              </TouchableOpacity>
            );
          })}

          {choice === ContinueChoice.PARTIAL_CLOSURE && (
            <View style={styles.partialClosureBlock} testID="tending-checkin-partial-closure">
              <Text style={styles.fieldLabel}>For each agreement</Text>
              {respondable.map((entry) => {
                const value = partialClosure[entry.id] ?? PartialClosureResolution.CONTINUING;
                return (
                  <View key={entry.id} style={styles.partialClosureRow}>
                    <Text style={styles.entryTitle}>{entry.summary ?? 'Tending entry'}</Text>
                    <View style={styles.partialClosureToggleRow}>
                      {(
                        [PartialClosureResolution.RESOLVED, PartialClosureResolution.CONTINUING] as const
                      ).map((r) => {
                        const sel = value === r;
                        return (
                          <TouchableOpacity
                            key={r}
                            style={[styles.toggleButton, sel && styles.toggleButtonSelected]}
                            onPress={() => setPartialClosure({ ...partialClosure, [entry.id]: r })}
                            accessibilityRole="button"
                            accessibilityState={{ selected: sel }}
                            testID={`tending-checkin-resolution-${entry.id}-${r}`}
                          >
                            <Text style={[styles.toggleText, sel && styles.toggleTextSelected]}>
                              {r === PartialClosureResolution.RESOLVED ? 'Resolved' : 'Continuing'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={goBack}
          accessibilityRole="button"
          testID="tending-checkin-back"
        >
          <Text style={styles.secondaryButtonText}>{stepIndex === 0 ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, isSubmitting && styles.disabled]}
          onPress={goNext}
          disabled={isSubmitting}
          accessibilityRole="button"
          testID={isLast ? 'tending-checkin-submit' : 'tending-checkin-next'}
        >
          <Text style={styles.primaryButtonText}>
            {isLast ? (isSubmitting ? 'Submitting…' : 'Submit') : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, gap: 12 },
  stepper: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stepDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  stepDotActive: { backgroundColor: colors.accent },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 12 },
  entryRow: { gap: 6 },
  entryTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  textInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
    padding: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  reflectionInput: { minHeight: 72 },
  choiceCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 8,
    backgroundColor: colors.bgSecondary,
  },
  choiceCardSelected: { borderColor: colors.accent, backgroundColor: colors.bgTertiary },
  choiceLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  choiceLabelSelected: { color: colors.accent },
  choiceSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  partialClosureBlock: { marginTop: 16, gap: 12 },
  partialClosureRow: { gap: 6 },
  partialClosureToggleRow: { flexDirection: 'row', gap: 8 },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  toggleButtonSelected: { borderColor: colors.accent, backgroundColor: colors.bgTertiary },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  toggleTextSelected: { color: colors.accent },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 16 },
  primaryButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
  },
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
