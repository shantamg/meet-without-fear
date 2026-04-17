/**
 * Slack Reconciler Notifications
 *
 * Implements the Gentle Interrupt pattern for the Stage 2B reconciler share
 * flow over Slack. When a Subject shares context with their Guesser via the
 * reconciler, the Guesser needs to see it promptly WITHOUT being forced to
 * respond mid-draft.
 *
 * Design decisions (captured from expert review on #91):
 *
 * - Immediate async post (not queued). If the Guesser is mid-compose and we
 *   HOLD the context until their next turn, they send an uninformed draft,
 *   then the bot replies "BTW your partner shared this 5 min ago…" — forcing
 *   a redo of emotional labor. Catastrophic UX.
 * - Post as a standalone DM (not `thread_ts`-chained to any pending user
 *   message). The Guesser sees it pop up above their text box and can
 *   choose to incorporate or not. Explicit "no need to reply to this"
 *   framing keeps it low-pressure.
 * - Quoted content uses Slack blockquote (`>` per line). Relies on
 *   `toSlackMrkdwn`'s multi-line blockquote normalization from Phase A.3.
 * - Fire-and-forget from the caller's perspective. Failures log but never
 *   block the reconciler transaction — the mobile path has its own Ably
 *   notification and can deliver even if Slack is down.
 * - No-op when the Guesser doesn't have a Slack thread (they're on mobile).
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { postMessage } from './slack-client';

export interface NotifyGuesserOfShareParams {
  sessionId: string;
  /** The Guesser's DB user id — they're the one receiving the share. */
  guesserUserId: string;
  /** The Subject's display name, for the "[Name] just shared..." framing. */
  subjectName: string;
  /** The raw shared content text, as the Subject provided it. */
  sharedContent: string;
}

export type NotifyGuesserOfShareResult =
  | { status: 'posted'; channelId: string }
  | { status: 'no_slack_thread' }
  | { status: 'post_failed'; error: string };

/**
 * Post a Gentle Interrupt to the Guesser's Slack DM thread when a Subject
 * shares context via the reconciler. Returns the outcome rather than
 * throwing so callers can treat this as fire-and-forget.
 */
export async function notifyGuesserOfShareViaSlack(
  params: NotifyGuesserOfShareParams
): Promise<NotifyGuesserOfShareResult> {
  const { sessionId, guesserUserId, subjectName, sharedContent } = params;

  const thread = await prisma.sessionSlackThread.findUnique({
    where: { sessionId_userId: { sessionId, userId: guesserUserId } },
    select: { channelId: true, threadTs: true },
  });

  if (!thread) {
    // Guesser is on mobile or hasn't been paired on Slack yet.
    return { status: 'no_slack_thread' };
  }

  // Quote EVERY line so Slack renders the whole paragraph as a blockquote.
  // toSlackMrkdwn's normalizer would do this too, but handling it here keeps
  // the posted text predictable and testable without depending on the
  // normalizer for correctness.
  const quotedShare = sharedContent
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  const text = [
    `💡 *${subjectName} just shared some context to help you:*`,
    quotedShare,
    '',
    '_Keep going whenever you\'re ready — no need to reply to this directly._',
  ].join('\n');

  // Post to the guesser's thread. Uses their thread_ts so it lands in the
  // session's conversation, not as a stray top-level DM.
  const res = await postMessage(thread.channelId, text, thread.threadTs);

  if (!res.ok) {
    logger.warn('[SlackReconcilerNotify] Gentle Interrupt post failed', {
      sessionId,
      guesserUserId,
      error: res.error,
    });
    return { status: 'post_failed', error: res.error ?? 'unknown' };
  }

  logger.info('[SlackReconcilerNotify] Gentle Interrupt posted', {
    sessionId,
    guesserUserId,
    channelId: thread.channelId,
  });
  return { status: 'posted', channelId: thread.channelId };
}

// ---------------------------------------------------------------------------
// Partner empathy reveal
// ---------------------------------------------------------------------------

export interface NotifyEmpathyRevealParams {
  sessionId: string;
  /** The Guesser's DB user id — they're the one RECEIVING the empathy. */
  recipientUserId: string;
  /** The Subject's display name — they DRAFTED the empathy about their partner. */
  subjectName: string;
  /** The empathy content the Subject drafted (NOT a quote of the Guesser). */
  empathyContent: string;
}

export type NotifyEmpathyRevealResult =
  | { status: 'posted'; channelId: string }
  | { status: 'no_slack_thread' }
  | { status: 'post_failed'; error: string };

/**
 * Post a partner's empathy statement to the recipient's Slack DM thread as
 * a blockquoted paragraph, with an intro that clearly attributes the
 * content to the other party. Mirrors the mobile-side EMPATHY_STATEMENT
 * card layout in a chat-native form.
 *
 * Framing note: this is the one place we DO want a clear call to respond.
 * Unlike the share Gentle Interrupt (which is a passive heads-up), receiving
 * your partner's empathy attempt is a moment that invites a reply. The text
 * explicitly asks "does this land?" with the accept / revise / decline
 * vocabulary so the classifier has clean input when the user answers.
 *
 * No-op when the recipient is on mobile (the mobile client renders its own
 * native empathy card via Ably).
 */
export async function postEmpathyRevealToSlack(
  params: NotifyEmpathyRevealParams
): Promise<NotifyEmpathyRevealResult> {
  const { sessionId, recipientUserId, subjectName, empathyContent } = params;

  const thread = await prisma.sessionSlackThread.findUnique({
    where: { sessionId_userId: { sessionId, userId: recipientUserId } },
    select: { channelId: true, threadTs: true },
  });

  if (!thread) {
    return { status: 'no_slack_thread' };
  }

  const quotedEmpathy = empathyContent
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  const text = [
    `💭 *${subjectName} shared their understanding of what you've been going through:*`,
    quotedEmpathy,
    '',
    '_Does this land for you? Reply `accept`, `revise <your correction>`, or `decline` — or share more to help them get closer._',
  ].join('\n');

  const res = await postMessage(thread.channelId, text, thread.threadTs);

  if (!res.ok) {
    logger.warn('[SlackReconcilerNotify] Empathy reveal post failed', {
      sessionId,
      recipientUserId,
      error: res.error,
    });
    return { status: 'post_failed', error: res.error ?? 'unknown' };
  }

  logger.info('[SlackReconcilerNotify] Empathy reveal posted', {
    sessionId,
    recipientUserId,
    channelId: thread.channelId,
  });
  return { status: 'posted', channelId: thread.channelId };
}
