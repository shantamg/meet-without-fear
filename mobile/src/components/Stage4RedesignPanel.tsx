import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, Clock, MinusCircle, Send, XCircle } from 'lucide-react-native';
import {
  GetStage4StateResponse,
  ProposalCardDTO,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4CoverageStatus,
  Stage4Phase,
  Stage4ProposalKind,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';
import { colors } from '@/theme';

interface Stage4RedesignPanelProps {
  state: GetStage4StateResponse;
  partnerName?: string | null;
  isSelecting?: boolean;
  isClosing?: boolean;
  onSelectProposal: (proposalId: string, decision: Stage4SelectionDecision) => void;
  onCloseStage4: (kind: Stage4ClosureKind, reason: Stage4ClosureReason) => void;
}

const decisionLabels: Record<Stage4SelectionDecision, string> = {
  [Stage4SelectionDecision.WILLING]: 'Willing',
  [Stage4SelectionDecision.NEEDS_DISCUSSION]: 'Discuss',
  [Stage4SelectionDecision.NOT_WILLING]: 'Not willing',
};

const coverageLabels: Record<Stage4CoverageStatus, string> = {
  COVERED: 'Covered',
  PARTIAL: 'Partly covered',
  OPEN: 'Open',
};

function phaseLabel(phase: Stage4Phase): string {
  switch (phase) {
    case Stage4Phase.INVENTORY_BUILDING:
      return 'Building proposals';
    case Stage4Phase.COVERAGE_REVIEW:
      return 'Checking coverage';
    case Stage4Phase.SELECTION:
      return 'Choosing willingness';
    case Stage4Phase.OUTCOME_REVIEW:
      return 'Reviewing outcome';
    case Stage4Phase.CLOSING:
      return 'Closing';
    case Stage4Phase.CLOSED_SHARED_AGREEMENT:
      return 'Shared agreement';
    case Stage4Phase.CLOSED_NO_SHARED_AGREEMENT:
      return 'No shared agreement';
    default:
      return 'Stage 4';
  }
}

function outcomeReasonLabel(reason: Stage4ClosureReason): string {
  switch (reason) {
    case Stage4ClosureReason.MUTUAL_SELECTION:
      return 'Mutual selection';
    case Stage4ClosureReason.NO_OVERLAP:
      return 'No mutual overlap';
    case Stage4ClosureReason.BOUNDARY_HONORED:
      return 'Boundary honored';
    case Stage4ClosureReason.USER_STOPPED:
      return 'Stopped here';
    default:
      return reason;
  }
}

function proposalKindLabel(kind: Stage4ProposalKind): string {
  return kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT
    ? 'Individual commitment'
    : 'Shared proposal';
}

function DecisionBadge({
  label,
  decision,
}: {
  label: string;
  decision?: Stage4SelectionDecision;
}) {
  return (
    <View style={styles.decisionBadge}>
      <Text style={styles.decisionLabel}>{label}</Text>
      <Text style={styles.decisionValue}>
        {decision ? decisionLabels[decision] : 'Private'}
      </Text>
    </View>
  );
}

function ProposalCard({
  proposal,
  partnerName,
  isSelecting,
  onSelectProposal,
}: {
  proposal: ProposalCardDTO;
  partnerName?: string | null;
  isSelecting?: boolean;
  onSelectProposal: (proposalId: string, decision: Stage4SelectionDecision) => void;
}) {
  const needsText = proposal.needsAddressed
    .map((need) => `${need.label} (${coverageLabels[need.coverage]})`)
    .join(', ');

  return (
    <View style={styles.proposalCard}>
      <View style={styles.proposalHeader}>
        <Text style={styles.proposalKind}>{proposalKindLabel(proposal.kind)}</Text>
        {proposal.ownerLabel && (
          <Text style={styles.ownerLabel}>{proposal.ownerLabel}</Text>
        )}
      </View>
      <Text style={styles.proposalDescription}>{proposal.description}</Text>
      {needsText.length > 0 && (
        <Text style={styles.proposalMeta}>Needs: {needsText}</Text>
      )}
      {proposal.duration && (
        <Text style={styles.proposalMeta}>Timing: {proposal.duration}</Text>
      )}
      {proposal.measureOfSuccess && (
        <Text style={styles.proposalMeta}>Success: {proposal.measureOfSuccess}</Text>
      )}

      <View style={styles.decisionRow}>
        <DecisionBadge label="You" decision={proposal.myDecision} />
        <DecisionBadge
          label={partnerName || 'Partner'}
          decision={proposal.partnerDecisionVisible}
        />
      </View>

      <View style={styles.selectionButtons}>
        {[
          Stage4SelectionDecision.WILLING,
          Stage4SelectionDecision.NEEDS_DISCUSSION,
          Stage4SelectionDecision.NOT_WILLING,
        ].map((decision) => {
          const selected = proposal.myDecision === decision;
          return (
            <TouchableOpacity
              key={decision}
              style={[styles.selectionButton, selected && styles.selectionButtonSelected]}
              onPress={() => onSelectProposal(proposal.id, decision)}
              disabled={isSelecting}
              accessibilityRole="button"
              accessibilityLabel={`${decisionLabels[decision]} for proposal`}
              accessibilityState={{ selected, disabled: isSelecting }}
            >
              <Text style={[styles.selectionButtonText, selected && styles.selectionButtonTextSelected]}>
                {decisionLabels[decision]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function NeedRows({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: GetStage4StateResponse['coverageAudit']['covered'];
  tone: 'covered' | 'partial' | 'open';
}) {
  if (rows.length === 0) return null;

  return (
    <View style={styles.coverageGroup}>
      <Text style={styles.coverageTitle}>{title}</Text>
      {rows.map((row, index) => (
        <View key={row.id || `${row.label}-${index}`} style={styles.needRow}>
          <View style={[styles.needDot, styles[`${tone}Dot`]]} />
          <View style={styles.needTextWrap}>
            <Text style={styles.needLabel}>{row.label}</Text>
            {row.note && <Text style={styles.needNote}>{row.note}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

export function Stage4RedesignPanel({
  state,
  partnerName,
  isSelecting = false,
  isClosing = false,
  onSelectProposal,
  onCloseStage4,
}: Stage4RedesignPanelProps) {
  const allProposals = [
    ...state.inventory.sharedProposals,
    ...state.inventory.individualCommitments,
  ];
  const mutualShared = state.inventory.sharedProposals.filter(
    (proposal) =>
      proposal.myDecision === Stage4SelectionDecision.WILLING &&
      proposal.partnerDecisionVisible === Stage4SelectionDecision.WILLING
  );
  const partnerSelections = state.partnerSelections ?? [];
  const canCloseShared = mutualShared.length > 0;
  const canCloseNoShared =
    (state.phase === Stage4Phase.OUTCOME_REVIEW ||
      state.phase === Stage4Phase.SELECTION ||
      state.phase === Stage4Phase.COVERAGE_REVIEW) &&
    partnerSelections.length > 0;
  const showNoSharedClose =
    state.phase === Stage4Phase.OUTCOME_REVIEW ||
    state.phase === Stage4Phase.SELECTION ||
    state.phase === Stage4Phase.COVERAGE_REVIEW;
  const noSharedCloseDisabled = !canCloseNoShared || isClosing;

  return (
    <View style={styles.container} testID="stage4-redesign-panel">
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>What comes next</Text>
          <Text style={styles.phasePill}>{phaseLabel(state.phase)}</Text>
        </View>
        <Text style={styles.subtitle}>
          Proposals are receipts from the conversation. Keep talking to add, revise, remove, or clarify them.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Proposal inventory</Text>
        {allProposals.length === 0 ? (
          <Text style={styles.emptyText}>No proposals captured yet.</Text>
        ) : (
          allProposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              partnerName={partnerName}
              isSelecting={isSelecting}
              onSelectProposal={onSelectProposal}
            />
          ))
        )}
        {state.inventory.unaddressedNeeds.length > 0 && (
          <View style={styles.unaddressedBox}>
            <Text style={styles.unaddressedTitle}>Still open</Text>
            {state.inventory.unaddressedNeeds.map((need, index) => (
              <Text key={need.id || `${need.label}-${index}`} style={styles.unaddressedNeed}>
                {need.label}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Needs coverage</Text>
        <NeedRows title="Covered" rows={state.coverageAudit.covered} tone="covered" />
        <NeedRows title="Partly covered" rows={state.coverageAudit.partial} tone="partial" />
        <NeedRows title="Open" rows={state.coverageAudit.open} tone="open" />
        {state.coverageAudit.covered.length === 0 &&
          state.coverageAudit.partial.length === 0 &&
          state.coverageAudit.open.length === 0 && (
            <Text style={styles.emptyText}>Coverage will appear once Stage 3 needs are available.</Text>
          )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Selection receipt</Text>
        <View style={styles.receiptRow}>
          <Check color={colors.success} size={18} />
          <Text style={styles.receiptText}>
            Your choices are saved proposal by proposal.
          </Text>
        </View>
        <View style={styles.receiptRow}>
          <Clock color={colors.textSecondary} size={18} />
          <Text style={styles.receiptText}>
            {state.partnerSelectionStatus === 'SUBMITTED'
              ? `${partnerName || 'Partner'} has submitted. Shared choices can now be reviewed.`
              : `${partnerName || 'Partner'} choices stay private until they submit.`}
          </Text>
        </View>
      </View>

      {state.outcome && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {state.outcome.kind === Stage4ClosureKind.SHARED_AGREEMENT
              ? 'Shared agreement outcome'
              : 'No shared agreement outcome'}
          </Text>
          <Text style={styles.outcomeReason}>{outcomeReasonLabel(state.outcome.reason)}</Text>
          <Text style={styles.outcomeSummary}>{state.outcome.summary}</Text>
          {state.outcome.agreements.map((agreement) => (
            <View key={agreement.id} style={styles.outcomeItem}>
              <Text style={styles.outcomeItemText}>{agreement.description}</Text>
            </View>
          ))}
          {state.outcome.openNeeds.length > 0 && (
            <Text style={styles.outcomeMeta}>
              Open needs carried forward: {state.outcome.openNeeds.map((need) => need.label).join(', ')}
            </Text>
          )}
        </View>
      )}

      {!state.outcome && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.closeButton, !canCloseShared && styles.disabledButton]}
            onPress={() =>
              onCloseStage4(
                Stage4ClosureKind.SHARED_AGREEMENT,
                Stage4ClosureReason.MUTUAL_SELECTION
              )
            }
            disabled={!canCloseShared || isClosing}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCloseShared || isClosing }}
          >
            <Send color={canCloseShared ? colors.textOnAccent : colors.textMuted} size={17} />
            <Text style={[styles.closeButtonText, !canCloseShared && styles.disabledButtonText]}>
              Close with shared agreement
            </Text>
          </TouchableOpacity>

          {showNoSharedClose && (
            <TouchableOpacity
              style={[styles.secondaryCloseButton, noSharedCloseDisabled && styles.disabledSecondaryButton]}
              onPress={() =>
                onCloseStage4(
                  Stage4ClosureKind.NO_SHARED_AGREEMENT,
                  Stage4ClosureReason.NO_OVERLAP
                )
              }
              disabled={noSharedCloseDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: noSharedCloseDisabled }}
            >
              <MinusCircle color={canCloseNoShared ? colors.textPrimary : colors.textMuted} size={17} />
              <Text style={[
                styles.secondaryCloseButtonText,
                noSharedCloseDisabled && styles.disabledButtonText,
              ]}>
                Close with no shared agreement
              </Text>
            </TouchableOpacity>
          )}
          {showNoSharedClose && partnerSelections.length === 0 && (
            <Text style={styles.actionHint}>
              Available once both partners have made selections.
            </Text>
          )}
        </View>
      )}

      {state.phase === Stage4Phase.CLOSED_NO_SHARED_AGREEMENT && (
        <View style={styles.closedNote}>
          <XCircle color={colors.warning} size={18} />
          <Text style={styles.closedNoteText}>
            This is a valid close. Passive Tending re-entry remains available.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  phasePill: {
    color: colors.textOnAccent,
    backgroundColor: colors.accent,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  proposalCard: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  proposalKind: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  ownerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  proposalDescription: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
  },
  proposalMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  decisionBadge: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  decisionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  decisionValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  selectionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  selectionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectionButtonSelected: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  selectionButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  selectionButtonTextSelected: {
    color: 'white',
  },
  unaddressedBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: 10,
    marginTop: 2,
  },
  unaddressedTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  unaddressedNeed: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  coverageGroup: {
    marginBottom: 10,
  },
  coverageTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  needRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 7,
  },
  needDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 5,
  },
  coveredDot: {
    backgroundColor: colors.success,
  },
  partialDot: {
    backgroundColor: colors.warning,
  },
  openDot: {
    backgroundColor: colors.error,
  },
  needTextWrap: {
    flex: 1,
  },
  needLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
  },
  needNote: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  receiptText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  outcomeReason: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  outcomeSummary: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  outcomeItem: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  outcomeItemText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
  },
  outcomeMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  actions: {
    gap: 8,
  },
  closeButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  closeButtonText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    backgroundColor: colors.bgTertiary,
  },
  disabledButtonText: {
    color: colors.textMuted,
  },
  secondaryCloseButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  disabledSecondaryButton: {
    borderColor: colors.border,
    backgroundColor: colors.bgTertiary,
  },
  secondaryCloseButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  actionHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  closedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: 12,
  },
  closedNoteText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
});

export default Stage4RedesignPanel;
