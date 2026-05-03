/**
 * Invitation Message Refinement Controller
 *
 * Stage 0 — after the initial invitation draft and topic frame are confirmed,
 * the user can iterate on the invitation text via a guided drafting chat
 * before they actually share it.
 *
 * - POST /sessions/:id/invitation/refine — user provides a steering message and
 *   recent chat history; AI returns a proposed new invitation message without
 *   committing it. The existing /invitation/confirm endpoint commits.
 *
 * The proposed message is persisted on the Invitation record (overwriting the
 * working draft) so the rest of the system (share button, panel preview)
 * picks it up immediately. Confirmation still flips messageConfirmed.
 */

import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { refineInvitationMessageRequestSchema } from '@meet-without-fear/shared';
import { successResponse, errorResponse } from '../utils/response';
import { isSessionCreator } from '../utils/session';
import { getSonnetResponse, BrainActivityCallType } from '../lib/bedrock';

export async function refineInvitationMessage(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;
    const parseResult = refineInvitationMessageRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const isCreator = await isSessionCreator(sessionId, user.id);
    if (!isCreator) {
      errorResponse(res, 'FORBIDDEN', 'Only the session creator can refine the invitation', 403);
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
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    const invitation = session.invitations[0];
    if (!invitation?.invitationMessage) {
      errorResponse(res, 'VALIDATION_ERROR', 'No invitation message found — draft the invitation first', 400);
      return;
    }

    if (invitation.messageConfirmed) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invitation already confirmed', 400);
      return;
    }

    const { message, history } = parseResult.data;
    const historyText = (history ?? [])
      .map((item) => `${item.role === 'user' ? 'User' : 'Coach'}: ${item.content}`)
      .join('\n');

    const turnId = `${sessionId}-${user.id}-invitation-refine`;
    const aiGenerated = await getSonnetResponse({
      systemPrompt: INVITATION_REFINE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            session.topicFrame ? `Topic frame: "${session.topicFrame}"` : null,
            `Current invitation message: "${invitation.invitationMessage}"`,
            historyText ? `Recent refinement chat:\n${historyText}` : null,
            `The user wants to adjust the invitation with this feedback: "${message}"`,
            'Generate the next proposed invitation message. Output ONLY the invitation text, no quotes or labels.',
          ].filter(Boolean).join('\n\n'),
        },
      ],
      maxTokens: 400,
      sessionId,
      turnId,
      operation: 'invitation-refine',
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
    });

    const invitationMessage = normalizeInvitationMessage(aiGenerated);
    if (!invitationMessage) {
      logger.warn(`[refineInvitationMessage] Invalid invitation from AI for session ${sessionId}: "${aiGenerated}"`);
      errorResponse(res, 'INTERNAL_ERROR', 'Failed to refine invitation', 500);
      return;
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { invitationMessage },
    });

    successResponse(res, {
      response: "Here's an updated draft.",
      invitationMessage,
    });
  } catch (error) {
    logger.error('[refineInvitationMessage] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to refine invitation', 500);
  }
}

const INVITATION_REFINE_SYSTEM_PROMPT = `You are helping someone refine an invitation message they will send to their partner inviting them into a conflict resolution session.

Goals for the invitation:
- First-person, warm, non-blaming. Speak as the sender to the partner.
- Acknowledges there is something to talk about without assigning fault.
- Invites collaboration ("can we", "I want us to", "I'd like to figure this out together").
- 1–4 short sentences. Plain, everyday language. No therapy-speak.
- Do NOT include links, signatures, names, or formatting.

Honor the user's steering feedback while keeping the invitation safe and inviting.

OUTPUT FORMAT:
Output ONLY the invitation message text. No quotes, no labels, no preamble, no explanation.`;

export function normalizeInvitationMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
  if (!trimmed) return null;
  if (trimmed.length < 10 || trimmed.length > 500) return null;
  return trimmed;
}
