/**
 * Topic Frame Controller
 *
 * Handles the topic frame lifecycle during Stage 0 (invite drafting):
 * - POST /sessions/:id/topic-frame/generate - AI-generate a topic frame from the invitation draft
 * - POST /sessions/:id/topic-frame/confirm  - User steers; AI moderates and persists the final frame
 *
 * The user cannot directly set the topic frame text. They can provide a steering
 * direction, but the AI always has final say on the 3-5 word framing to guard
 * against inappropriate or blaming language.
 */

import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { confirmTopicFrameRequestSchema } from '@meet-without-fear/shared';
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

    // If topic frame already confirmed, return it
    if (session.topicFrame) {
      successResponse(res, { topicFrame: session.topicFrame, alreadyConfirmed: true });
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
          content: `The user is drafting an invitation for their partner to join a conflict resolution session. Here is the invitation message they have written:\n\n"${invitationRecord.invitationMessage}"\n\nGenerate a neutral topic frame (3-5 words) that captures what this conflict is about.`,
        },
      ],
      maxTokens: 50,
      sessionId,
      turnId,
      operation: 'topic-frame-generate',
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
    });

    const topicFrame = proposed?.trim().replace(/^["']|["']$/g, '') || null;

    if (!topicFrame) {
      errorResponse(res, 'INTERNAL_ERROR', 'Failed to generate topic frame', 500);
      return;
    }

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

    // Build context for AI moderation
    const contextParts: string[] = [];
    const invitationMessage = session.invitations[0]?.invitationMessage;
    if (invitationMessage) {
      contextParts.push(`Invitation message: "${invitationMessage}"`);
    }
    if (session.topicFrame) {
      contextParts.push(`Previously proposed topic frame: "${session.topicFrame}"`);
    }
    if (steer) {
      contextParts.push(`The user wants to steer the framing toward: "${steer}"`);
    }

    const turnId = `${sessionId}-${user.id}-topic-frame-confirm`;

    // AI moderates the final frame — user's steer is guidance only
    const aiGenerated = await getSonnetResponse({
      systemPrompt: TOPIC_FRAME_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${contextParts.join('\n\n')}\n\nGenerate the final neutral topic frame (3-5 words). You have final say on the framing — guard against inappropriate or blaming language.`,
        },
      ],
      maxTokens: 50,
      sessionId,
      turnId,
      operation: 'topic-frame-confirm',
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
    });

    const finalTopicFrame = aiGenerated?.trim().replace(/^["']|["']$/g, '') || null;

    if (!finalTopicFrame) {
      errorResponse(res, 'INTERNAL_ERROR', 'Failed to generate topic frame', 500);
      return;
    }

    // Persist the AI-generated frame (not the user's steer text)
    const now = new Date();
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { topicFrame: finalTopicFrame },
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

// ============================================================================
// Prompt
// ============================================================================

const TOPIC_FRAME_SYSTEM_PROMPT = `You are generating a neutral topic frame for a conflict resolution session.

Based on the user's invitation message (written during Stage 0 invite drafting), produce a SHORT, NEUTRAL phrase (3-5 words) that describes the conflict topic. This will be shown to the other person when they receive the invitation, so they know what conflict they've been invited to engage with.

RULES:
- 3-5 words only. No more.
- Neutral tone — no blame, no judgment, no emotional loading.
- Specific enough that the other person recognizes it, but not so detailed it feels like a summary.
- Use plain, everyday language. No clinical or therapeutic jargon.
- Do NOT include names.
- Output ONLY the topic frame text. No quotes, no explanation, no preamble.

GOOD EXAMPLES:
- Tuesday pickup disagreement
- Moving plans conversation
- Holiday visit tension
- Morning routine frustration
- Budget priorities discussion

BAD EXAMPLES (too vague):
- Relationship issues
- Communication problems
- Our situation

BAD EXAMPLES (too blaming):
- Your anger problem
- When you lied
- Your spending habits`;
