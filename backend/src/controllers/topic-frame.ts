/**
 * Topic Frame Controller
 *
 * Handles the topic frame lifecycle during Stage 0 (invite drafting):
 * - POST /sessions/:id/topic-frame/generate - AI-generate a topic frame from the invitation draft
 * - POST /sessions/:id/topic-frame/refine   - User chats to revise the proposed frame without confirming
 * - POST /sessions/:id/topic-frame/confirm  - User confirms the current frame
 *
 * The user cannot directly set the topic frame text. They can provide a steering
 * direction, but the AI always has final say on the 3-5 word framing to guard
 * against inappropriate or blaming language.
 */

import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { confirmTopicFrameRequestSchema, refineTopicFrameRequestSchema } from '@meet-without-fear/shared';
import { successResponse, errorResponse } from '../utils/response';
import { isSessionCreator } from '../utils/session';
import { getSonnetResponse, BrainActivityCallType } from '../lib/bedrock';

/**
 * Generate a proposed topic frame from the Stage 0 invitation draft.
 * POST /sessions/:id/topic-frame/generate
 *
 * Called during Stage 0, before the user shares the invite link. Uses the
 * invitation message the user has drafted to AI-generate a neutral 3-5 word
 * topic frame.
 */
export async function generateTopicFrame(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Only the session creator (user 1) can generate the topic frame
    const isCreator = await isSessionCreator(sessionId, user.id);
    if (!isCreator) {
      errorResponse(res, 'FORBIDDEN', 'Only the session creator can generate a topic frame', 403);
      return;
    }

    // Check session exists
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: { some: { userId: user.id } },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // If topic frame already exists, return it. It may be a proposal or a finalized frame.
    if (session.topicFrame) {
      successResponse(res, {
        topicFrame: session.topicFrame,
        alreadyConfirmed: !!session.topicFrameConfirmedAt,
        confirmedAt: session.topicFrameConfirmedAt?.toISOString(),
      });
      return;
    }

    // Fetch the invitation draft for context (Stage 0 — user has been drafting their invite)
    const invitationRecord = await prisma.invitation.findFirst({
      where: {
        sessionId,
        invitedById: user.id,
      },
      orderBy: { createdAt: 'desc' },
      select: { invitationMessage: true },
    });

    if (!invitationRecord?.invitationMessage) {
      errorResponse(res, 'VALIDATION_ERROR', 'No invitation message found — draft the invitation first', 400);
      return;
    }

    const turnId = `${sessionId}-${user.id}-topic-frame-generate`;

    const proposed = await getSonnetResponse({
      systemPrompt: TOPIC_FRAME_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `The user is drafting an invitation for their partner to join a conflict resolution session. Here is the invitation message they have written:\n\n"${invitationRecord.invitationMessage}"\n\nGenerate one neutral topic frame that captures what this conflict is about. Output ONLY the topic frame text.`,
        },
      ],
      maxTokens: 80,
      sessionId,
      turnId,
      operation: 'topic-frame-generate',
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
    });

    const topicFrame = normalizeTopicFrame(proposed);
    if (!topicFrame) {
      logger.warn(`[generateTopicFrame] Invalid topic frame from AI for session ${sessionId}: "${proposed}"`);
      errorResponse(res, 'INTERNAL_ERROR', 'Failed to generate topic frame', 500);
      return;
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        topicFrame,
        topicFrameConfirmedAt: null,
      },
    });

    successResponse(res, { topicFrame, alreadyConfirmed: false });
  } catch (error) {
    logger.error('[generateTopicFrame] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to generate topic frame', 500);
  }
}

/**
 * AI-moderate and confirm the topic frame.
 * POST /sessions/:id/topic-frame/confirm
 *
 * The user can provide an optional steering direction. The AI always has final
 * say on the 3-5 word framing — the user's steer is guidance only. Persists the
 * AI-generated frame on the Session record.
 */
export async function confirmTopicFrame(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Validate request body
    const parseResult = confirmTopicFrameRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const { steer } = parseResult.data;

    // Only the session creator can confirm the topic frame
    const isCreator = await isSessionCreator(sessionId, user.id);
    if (!isCreator) {
      errorResponse(res, 'FORBIDDEN', 'Only the session creator can confirm the topic frame', 403);
      return;
    }

    // Fetch session and invitation for AI context
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: { members: { some: { userId: user.id } } },
      },
      include: {
        invitations: {
          where: { invitedById: user.id },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { invitationMessage: true },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    const invitationMessage = session.invitations[0]?.invitationMessage;
    if (!invitationMessage) {
      errorResponse(res, 'VALIDATION_ERROR', 'No invitation message found — draft the invitation first', 400);
      return;
    }

    // Build context for AI moderation
    const contextParts: string[] = [];
    contextParts.push(`Invitation message: "${invitationMessage}"`);
    if (session.topicFrame) {
      contextParts.push(`Current AI-proposed topic frame: "${session.topicFrame}"`);
    }
    if (steer) {
      contextParts.push(`The user wants to steer the framing toward: "${steer}"`);
    }

    let finalTopicFrame = !steer && session.topicFrame
      ? normalizeTopicFrame(session.topicFrame)
      : null;

    if (!finalTopicFrame) {
      const turnId = `${sessionId}-${user.id}-topic-frame-confirm`;

      // AI moderates the final frame — user's steer is guidance only
      const aiGenerated = await getSonnetResponse({
        systemPrompt: TOPIC_FRAME_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `${contextParts.join('\n\n')}\n\nGenerate the final neutral topic frame. Output ONLY the topic frame text. You have final say on the framing — guard against inappropriate or blaming language.`,
          },
        ],
        maxTokens: 80,
        sessionId,
        turnId,
        operation: 'topic-frame-confirm',
        callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
      });

      finalTopicFrame = normalizeTopicFrame(aiGenerated);
      if (!finalTopicFrame) {
        logger.warn(`[confirmTopicFrame] Invalid topic frame from AI for session ${sessionId}: "${aiGenerated}"`);
      }
    }

    if (!finalTopicFrame) {
      errorResponse(res, 'INTERNAL_ERROR', 'Failed to generate topic frame', 500);
      return;
    }

    // Persist the AI-generated frame (not the user's steer text)
    const now = new Date();
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        topicFrame: finalTopicFrame,
        topicFrameConfirmedAt: now,
      },
    });

    logger.info(`[confirmTopicFrame] Topic frame confirmed for session ${sessionId}: "${finalTopicFrame}"`);

    successResponse(res, {
      topicFrame: updated.topicFrame,
      confirmedAt: now.toISOString(),
    });
  } catch (error) {
    logger.error('[confirmTopicFrame] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm topic frame', 500);
  }
}

/**
 * Refine the proposed topic frame without confirming it.
 * POST /sessions/:id/topic-frame/refine
 */
export async function refineTopicFrame(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;
    const parseResult = refineTopicFrameRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const isCreator = await isSessionCreator(sessionId, user.id);
    if (!isCreator) {
      errorResponse(res, 'FORBIDDEN', 'Only the session creator can refine a topic frame', 403);
      return;
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: { members: { some: { userId: user.id } } },
      },
      include: {
        invitations: {
          where: { invitedById: user.id },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { invitationMessage: true },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    const invitationMessage = session.invitations[0]?.invitationMessage;
    if (!invitationMessage) {
      errorResponse(res, 'VALIDATION_ERROR', 'No invitation message found — draft the invitation first', 400);
      return;
    }

    const { message, history } = parseResult.data;
    const historyText = (history ?? [])
      .map((item) => `${item.role === 'user' ? 'User' : 'Coach'}: ${item.content}`)
      .join('\n');

    const turnId = `${sessionId}-${user.id}-topic-frame-refine`;
    const aiGenerated = await getSonnetResponse({
      systemPrompt: TOPIC_FRAME_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            `Invitation message: "${invitationMessage}"`,
            session.topicFrame ? `Current proposed topic frame: "${session.topicFrame}"` : null,
            historyText ? `Recent topic refinement chat:\n${historyText}` : null,
            `The user wants to adjust the topic direction with this message: "${message}"`,
            'Generate the next neutral topic frame proposal. Output ONLY the topic frame text. You have final say on the framing — guard against inappropriate or blaming language.',
          ].filter(Boolean).join('\n\n'),
        },
      ],
      maxTokens: 80,
      sessionId,
      turnId,
      operation: 'topic-frame-refine',
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
    });

    const topicFrame = normalizeTopicFrame(aiGenerated);
    if (!topicFrame) {
      logger.warn(`[refineTopicFrame] Invalid topic frame from AI for session ${sessionId}: "${aiGenerated}"`);
      errorResponse(res, 'INTERNAL_ERROR', 'Failed to refine topic frame', 500);
      return;
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        topicFrame,
        topicFrameConfirmedAt: null,
      },
    });

    successResponse(res, {
      response: "I'd try this framing.",
      topicFrame,
    });
  } catch (error) {
    logger.error('[refineTopicFrame] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to refine topic frame', 500);
  }
}

// ============================================================================
// Prompt
// ============================================================================

const TOPIC_FRAME_SYSTEM_PROMPT = `You are generating a neutral topic frame for a conflict resolution session.

Based on the user's invitation message (written during Stage 0 invite drafting), produce a SHORT, NEUTRAL phrase (3-5 words) that describes the conflict topic. This will be shown to the other person when they receive the invitation, so they know what conflict they've been invited to engage with.

RULES:
- 3-5 words only for the final topic.
- Neutral tone — no blame, no judgment, no emotional loading.
- Specific enough that the other person recognizes it, but not so detailed it feels like a summary.
- Use plain, everyday language. No clinical or therapeutic jargon.
- Do NOT include names.

OUTPUT FORMAT:
Write ONLY the final topic frame text. No quotes, no label, no explanation, no candidate list.

GOOD EXAMPLES of final topics:
- Tuesday pickup disagreement
- Moving plans conversation
- Holiday visit tension
- Morning routine frustration
- Budget priorities discussion
- How often we talk

BAD EXAMPLES (too clinical):
- Communication frequency expectations
- Interpersonal boundary negotiation
- Parental contact dynamics

BAD EXAMPLES (too vague):
- Relationship issues
- Communication problems
- Our situation

BAD EXAMPLES (too blaming):
- Your anger problem
- When you lied
- Your spending habits`;

export function normalizeTopicFrame(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // The response may contain thinking/critique lines followed by the final topic
  // on the last line. Only accept that final line so we do not accidentally
  // persist a candidate that the model considered and rejected earlier.
  const lines = raw.trim().split('\n').filter((l) => l.trim());
  const finalLine = lines[lines.length - 1];
  if (!finalLine) return null;

  const candidate = cleanTopicFrameCandidate(finalLine);
  if (candidate) return candidate;

  const candidateMatches = [...raw.matchAll(/\*{0,2}\s*candidate\s+\d+\s*:\s*["“]([^"”\n]+)["”]/gi)];
  for (let i = candidateMatches.length - 1; i >= 0; i--) {
    const fallback = cleanTopicFrameCandidate(candidateMatches[i][1]);
    if (fallback) return fallback;
  }

  return null;
}

function cleanTopicFrameCandidate(raw: string): string | null {
  const candidate = raw
    .trim()
    .replace(/^[-•*]\s*/, '') // strip leading bullet
    .replace(/^(?:final\s+(?:topic\s+frame|topic|choice|frame)|topic\s+frame|topic)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!candidate) return null;
  if (/[.!?;:]/.test(candidate)) return null;

  const words = candidate.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;

  return candidate;
}
