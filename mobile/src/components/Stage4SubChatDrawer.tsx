/**
 * Stage 4 Sub-chat Drawer.
 *
 * Thin adapter over GuidedDraftChatModal (the same surface used by the
 * Feedback Coach and the empathy/share refinement chats). It's a real chat
 * in a drawer: each AI turn appears inline, and when the AI offers a
 * concrete candidate, it renders as a draft card under that AI message
 * with a "Use this version" action.
 *
 * Three anchor kinds, same flow:
 *   - NEEDS_BRAINSTORM     — accepting a candidate creates a new proposal
 *   - PROPOSAL_REFINEMENT  — accepting a candidate updates the existing one
 *   - NO_OVERLAP           — accepting a candidate creates a new proposal
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  MessageRole,
  Stage,
  Stage4ProposalDraft,
  Stage4SubChatAnchor,
  Stage4SubChatDTO,
} from '@meet-without-fear/shared';
import { useAppAppearance } from '@/theme';
import { GuidedDraftChatModal, GuidedDraftMessage } from './GuidedDraftChatModal';

export interface Stage4SubChatDrawerProps {
  visible: boolean;
  subChat: Stage4SubChatDTO | null;
  /** Friendly label for the anchor (need label or proposal description). */
  anchorLabel?: string | null;
  /** Existing proposal text when anchor is PROPOSAL_REFINEMENT — seeded as the first AI turn. */
  initialProposalText?: string | null;
  isSending?: boolean;
  isResolving?: boolean;
  onSendMessage: (content: string) => void;
  onResolve: (payload: {
    acceptedProposals: Stage4ProposalDraft[];
    updatedProposals: Stage4ProposalDraft[];
  }) => void;
  onClose: () => void;
  testID?: string;
}

function titleForAnchor(anchor: Stage4SubChatAnchor): string {
  switch (anchor) {
    case Stage4SubChatAnchor.NEEDS_BRAINSTORM:
      return 'Brainstorm a proposal';
    case Stage4SubChatAnchor.PROPOSAL_REFINEMENT:
      return 'Refine this proposal';
    case Stage4SubChatAnchor.NO_OVERLAP:
      return 'Find a version that fits';
  }
}

function emptyCopyForAnchor(
  anchor: Stage4SubChatAnchor,
  anchorLabel?: string | null,
  initialProposalText?: string | null,
): { title: string; message: string } {
  switch (anchor) {
    case Stage4SubChatAnchor.NEEDS_BRAINSTORM:
      return {
        title: anchorLabel ? `"${anchorLabel}"` : 'An open need',
        message: `What do you want to try? I'll propose a version you can use.`,
      };
    case Stage4SubChatAnchor.PROPOSAL_REFINEMENT:
      return {
        title: initialProposalText ? `"${initialProposalText}"` : 'This proposal',
        message: `What feels off? I'll propose a reshaped version you can use.`,
      };
    case Stage4SubChatAnchor.NO_OVERLAP:
      return {
        title: 'No mutual willing yet',
        message: `What should we try — a smaller scope, a different duration, a different success measure? I'll propose a candidate.`,
      };
  }
}

export function Stage4SubChatDrawer({
  visible,
  subChat,
  anchorLabel,
  initialProposalText,
  isSending = false,
  isResolving = false,
  onSendMessage,
  onResolve,
  onClose,
  testID = 'stage4-subchat-drawer',
}: Stage4SubChatDrawerProps) {
  const anchor = subChat?.anchorKind ?? Stage4SubChatAnchor.NEEDS_BRAINSTORM;
  const sessionKey = subChat ? `stage4-subchat-${subChat.id}` : 'stage4-subchat';
  const sessionId = subChat?.sessionId ?? '';
  const userId = subChat?.userId ?? '';

  // Map the sub-chat messages to GuidedDraftMessage. The AI's candidate (when
  // present) becomes the inline draft card under that message via
  // `proposedContent`. The anchor (existing proposal text or need label) is
  // shown as a sticky heading above the chat — not seeded into the thread —
  // so it stays foregrounded as the conversation grows.
  const messages: GuidedDraftMessage[] = useMemo(() => {
    return (subChat?.messages ?? []).map((m) => ({
      id: m.id,
      sessionId,
      senderId: m.role === MessageRole.USER ? userId : null,
      role: m.role,
      content: m.content,
      stage: Stage.STRATEGIC_REPAIR,
      timestamp: m.createdAt,
      proposedContent: m.candidate?.description ?? null,
    }));
  }, [sessionId, subChat, userId]);

  // Track the latest message id that carries a candidate so onFinalize can
  // look up the candidate's metadata (notably `proposalId`).
  const candidateByDescription = useMemo(() => {
    const map = new Map<string, Stage4ProposalDraft>();
    for (const m of subChat?.messages ?? []) {
      if (m.candidate) map.set(m.candidate.description, m.candidate);
    }
    return map;
  }, [subChat]);

  const handleFinalize = (content: string) => {
    const candidate =
      candidateByDescription.get(content) ?? { description: content };
    if (candidate.proposalId) {
      onResolve({
        acceptedProposals: [],
        updatedProposals: [
          {
            proposalId: candidate.proposalId,
            description: candidate.description,
            duration: candidate.duration ?? null,
            measureOfSuccess: candidate.measureOfSuccess ?? null,
          },
        ],
      });
    } else {
      onResolve({
        acceptedProposals: [
          {
            description: candidate.description,
            duration: candidate.duration ?? null,
            measureOfSuccess: candidate.measureOfSuccess ?? null,
          },
        ],
        updatedProposals: [],
      });
    }
  };

  const empty = emptyCopyForAnchor(anchor, anchorLabel, initialProposalText);
  const anchorText =
    anchor === Stage4SubChatAnchor.PROPOSAL_REFINEMENT
      ? initialProposalText ?? null
      : anchor === Stage4SubChatAnchor.NEEDS_BRAINSTORM
        ? anchorLabel ?? null
        : null;
  const anchorEyebrow =
    anchor === Stage4SubChatAnchor.PROPOSAL_REFINEMENT
      ? 'Refining'
      : anchor === Stage4SubChatAnchor.NEEDS_BRAINSTORM
        ? 'Brainstorming for'
        : null;

  return (
    <GuidedDraftChatModal
      visible={visible}
      title={titleForAnchor(anchor)}
      sessionKey={sessionKey}
      messages={messages}
      isLoading={isSending}
      isFinalizing={isResolving}
      partnerName=""
      proposalTitle="Proposed version"
      proposalSubtitle="Tap to use this; keep chatting to refine it more."
      finalActionLabel="Use this version"
      finalActionLatestOnly
      onSendMessage={onSendMessage}
      onFinalize={handleFinalize}
      onClose={onClose}
      emptyStateTitle={anchorText ? '' : empty.title}
      emptyStateMessage={anchorText ? '' : empty.message}
      finalButtonTestID={`${testID}-use-candidate`}
      testID={testID}
      anchorHeader={
        anchorText ? (
          <AnchorHeading eyebrow={anchorEyebrow} text={anchorText} />
        ) : null
      }
    />
  );
}

function AnchorHeading({ eyebrow, text }: { eyebrow: string | null; text: string }) {
  const { palette } = useAppAppearance();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        eyebrow: {
          color: palette.accentText,
          fontSize: 12,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        },
        text: {
          color: palette.text,
          fontSize: 20,
          fontWeight: '700',
          lineHeight: 28,
        },
      }),
    [palette],
  );
  return (
    <View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

export default Stage4SubChatDrawer;
