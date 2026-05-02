/**
 * Topic Frame Controller
 *
 * Handles the topic frame lifecycle:
 * - POST /sessions/:id/topic-frame/generate - AI-generate a topic frame from Stage 1 conversation
 * - POST /sessions/:id/topic-frame/confirm - Confirm (or edit) the topic frame
 */

import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { confirmTopicFrameRequestSchema } from '@meet-without-fear/shared';
import { successResponse, errorResponse } from '../utils/response';
import { isSessionCreator } from '../utils/session';
import { getSonnetResponse, BrainActivityCallType } from '../lib/bedrock';

/**
 * Generate a proposed topic frame from Stage 1 conversation.
 * POST /sessions/:id/topic-frame/generate
 *
 * Uses the user's Stage 1 messages to AI-generate a neutral 3-5 word topic frame.
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

    // Fetch Stage 1 conversation for context
    const stage1Messages = await prisma.message.findMany({
      where: {
        sessionId,
        stage: 1,
        OR: [
          { senderId: user.id, forUserId: null },
          { forUserId: user.id },
        ],
      },
      orderBy: { timestamp: 'asc' },
      take: 20,
      select: { role: true, content: true },
    });

    if (stage1Messages.length === 0) {
      errorResponse(res, 'VALIDATION_ERROR', 'No Stage 1 conversation found', 400);
      return;
    }

    // Build conversation summary for the AI
    const conversationText = stage1Messages
      .map((m) => `${m.role === 'USER' ? 'User' : 'AI'}: ${m.content}`)
      .join('\n');

    const turnId = `${sessionId}-${user.id}-topic-frame-generate`;

    const proposed = await getSonnetResponse({
      systemPrompt: TOPIC_FRAME_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Here is the Stage 1 conversation:\n\n${conversationText}\n\nGenerate a neutral topic frame (3-5 words).` },
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
 * Confirm (or edit) the topic frame.
 * POST /sessions/:id/topic-frame/confirm
 *
 * Persists the confirmed topic frame on the Session record.
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

    const { topicFrame } = parseResult.data;

    // Only the session creator can confirm the topic frame
    const isCreator = await isSessionCreator(sessionId, user.id);
    if (!isCreator) {
      errorResponse(res, 'FORBIDDEN', 'Only the session creator can confirm the topic frame', 403);
      return;
    }

    // Persist on the session
    const now = new Date();
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { topicFrame },
    });

    logger.info(`[confirmTopicFrame] Topic frame confirmed for session ${sessionId}: "${topicFrame}"`);

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

Based on the user's Stage 1 conversation (where they shared what's been going on), produce a SHORT, NEUTRAL phrase (3-5 words) that describes the conflict topic. This will be shown to the other person when they receive the invitation, so they know what conflict they've been invited to engage with.

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
