/**
 * Slack Empathy Exchange
 *
 * Helpers for Slack-specific Stage 2 interactions that aren't transport-
 * agnostic:
 *   - Detecting a subject's `share` command from free text
 *   - Marking an EmpathyDraft ready-to-share and returning its content
 *
 * Intentionally narrow in scope. The broader Stage 2 state machine
 * (EmpathyAttempt creation, reconciler triggering, cross-user Ably notify)
 * stays in the existing mobile controllers; this module just provides the
 * command-parsing + state-flip primitives those controllers can compose
 * with when called from the Slack flow.
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Detect a Stage-2 share intent in the user's free text. Matches unambiguous
 * lead-word commands only — we don't want to accidentally catch mid-sentence
 * uses of "share" (e.g. "I want to share something with you..."). Block-Kit-
 * style command detection via explicit keywords keeps the gate crisp.
 */
const SHARE_COMMAND_RE = /^\s*(share|share it|send it|ship it)\s*[.!]?\s*$/i;

export function detectShareCommand(text: string): boolean {
  return SHARE_COMMAND_RE.test(text);
}

/**
 * Detect a Stage-0 solo invitation-send intent. Fires after the AI has
 * proposed a draft `<draft>` invitation and the user wants to commit it
 * (conceptually — nothing is actually sent anywhere; the solo flow just
 * advances the user to Stage 1).
 *
 * Deliberately conservative: lead-word commands and a few common
 * affirmative prefixes. We reject mid-sentence uses like "I'll send it
 * later" or "can you send it?" so the gate doesn't flip on narration or
 * questions. Stage-2's `share`/`send it` command is handled separately in
 * `detectShareCommand` and doesn't overlap (Stage 0 vs Stage 2 routing
 * happens upstream in slack-conversation).
 */
const SEND_INVITATION_PATTERNS: ReadonlyArray<RegExp> = [
  /^(send\s+it|sent|go\s+ahead|ship\s+it|looks\s+good[,\s]*send)/i,
  /^(yes|yep|yeah|yup|ok|okay)[\s,]*(send|ship)/i,
  /^that\s+(looks|sounds)\s+(good|right)[,\s]*(send|ship)/i,
];

export function detectSendInvitationCommand(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return SEND_INVITATION_PATTERNS.some((re) => re.test(trimmed));
}

export interface SlackShareResult {
  status: 'marked_ready' | 'already_ready' | 'no_draft' | 'empty_draft';
  /** Draft content at the moment we flipped the flag — safe to echo to the user. */
  draftContent?: string;
  draftId?: string;
}

/**
 * Mark the user's current EmpathyDraft ready-to-share. Returns the draft
 * content + id so the caller can echo back a confirmation and (in a follow-
 * up iteration) feed the content into an EmpathyAttempt creation.
 *
 * The actual EmpathyAttempt persistence + reconciler handoff belongs in the
 * existing Stage 2 controllers; this helper is deliberately scoped to the
 * draft flag so the command-detection layer stays testable without deep
 * controller coupling.
 */
export async function markDraftReadyToShare(
  sessionId: string,
  userId: string
): Promise<SlackShareResult> {
  const draft = await prisma.empathyDraft.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { id: true, content: true, readyToShare: true },
  });

  if (!draft) {
    return { status: 'no_draft' };
  }
  if (!draft.content || draft.content.trim().length === 0) {
    return { status: 'empty_draft', draftId: draft.id };
  }
  if (draft.readyToShare) {
    return { status: 'already_ready', draftId: draft.id, draftContent: draft.content };
  }

  await prisma.empathyDraft.update({
    where: { id: draft.id },
    data: { readyToShare: true },
  });

  logger.info('[SlackEmpathyExchange] Draft marked ready to share', {
    sessionId,
    userId,
    draftId: draft.id,
  });

  return { status: 'marked_ready', draftId: draft.id, draftContent: draft.content };
}
