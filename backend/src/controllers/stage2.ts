/**
 * Stage 2 Controller
 *
 * Handles the Perspective Stretch / Empathy stage endpoints:
 * - POST /sessions/:id/empathy/draft - Save empathy draft
 * - GET /sessions/:id/empathy/draft - Get current draft
 * - POST /sessions/:id/empathy/consent - Consent to share
 * - GET /sessions/:id/empathy/partner - Get partner's empathy
 * - POST /sessions/:id/empathy/validate - Validate partner's empathy
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  saveEmpathyDraftRequestSchema,
  consentToShareRequestSchema,
  validateEmpathyRequestSchema,
  ApiResponse,
  ErrorCode,
} from '@meet-without-fear/shared';
import { notifyPartner } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getSonnetResponse } from '../lib/bedrock';
import { extractJsonFromResponse } from '../utils/json-extractor';
import { embedMessage } from '../services/embedding';
import { updateSessionSummary } from '../services/conversation-summarizer';
import { notifyEmpathyShared } from '../services/notification';
import { runReconciler } from '../services/reconciler';
import { isSessionCreator } from '../utils/session';

// ============================================================================
// Types
// ============================================================================

interface SessionWithRelationship {
  id: string;
  status: string;
  relationship: {
    members: Array<{ userId: string }>;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get partner's user ID from session data
 */
function getPartnerUserIdFromSession(
  session: SessionWithRelationship,
  currentUserId: string
): string | null {
  const partner = session.relationship.members.find(
    (m) => m.userId !== currentUserId
  );

  return partner?.userId ?? null;
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Save or update empathy draft
 * POST /sessions/:id/empathy/draft
 */
export async function saveDraft(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = saveEmpathyDraftRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { content, readyToShare } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session allows saving draft
    // Allow ACTIVE status for all users, and INVITED status for the session creator
    if (session.status !== 'ACTIVE') {
      if (session.status === 'INVITED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }
        // Creator can proceed while session is INVITED
      } else {
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 2
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 2) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot save empathy draft: you are in stage ${currentStage}, but stage 2 is required`,
        400
      );
      return;
    }

    // Upsert empathy draft
    // Important: if readyToShare is omitted, preserve existing readyToShare value.
    const updateData: { content: string; readyToShare?: boolean; version: { increment: number } } = {
      content,
      version: { increment: 1 },
    };
    if (typeof readyToShare === 'boolean') {
      updateData.readyToShare = readyToShare;
    }

    const draft = await prisma.empathyDraft.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId: user.id,
        },
      },
      create: {
        sessionId,
        userId: user.id,
        content,
        readyToShare: typeof readyToShare === 'boolean' ? readyToShare : false,
        version: 1,
      },
      update: updateData,
    });

    successResponse(res, {
      draftId: draft.id,
      savedAt: draft.updatedAt.toISOString(),
      readyToShare: draft.readyToShare,
    });
  } catch (error) {
    console.error('[saveDraft] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to save draft', 500);
  }
}

/**
 * Get current empathy draft
 * GET /sessions/:id/empathy/draft
 */
export async function getDraft(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Get draft
    const draft = await prisma.empathyDraft.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: user.id,
        },
      },
    });

    // Check if user has already consented to share
    const existingConsent = await prisma.consentRecord.findFirst({
      where: {
        userId: user.id,
        sessionId,
        targetType: 'EMPATHY_DRAFT',
        decision: 'GRANTED',
      },
    });

    // Can consent if draft exists and is ready to share
    const canConsent = !!(draft && draft.readyToShare && !existingConsent);
    const alreadyConsented = !!existingConsent;

    successResponse(res, {
      draft: draft
        ? {
          id: draft.id,
          content: draft.content,
          readyToShare: draft.readyToShare,
          version: draft.version,
          updatedAt: draft.updatedAt.toISOString(),
        }
        : null,
      canConsent,
      alreadyConsented,
    });
  } catch (error) {
    console.error('[getDraft] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get draft', 500);
  }
}

/**
 * Consent to share empathy with partner
 * POST /sessions/:id/empathy/consent
 */
export async function consentToShare(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = consentToShareRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { consent } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      include: {
        relationship: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session allows consent
    // Allow ACTIVE status for all users, and INVITED status for the session creator
    if (session.status !== 'ACTIVE') {
      if (session.status === 'INVITED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }
        // Creator can proceed while session is INVITED
      } else {
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 2
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 2) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot consent to share: you are in stage ${currentStage}, but stage 2 is required`,
        400
      );
      return;
    }

    // Get draft and check it's ready to share
    const draft = await prisma.empathyDraft.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: user.id,
        },
      },
    });

    if (!draft || !draft.readyToShare) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Draft must be marked as ready to share before consenting',
        400
      );
      return;
    }

    // Create consent record
    await prisma.consentRecord.create({
      data: {
        userId: user.id,
        sessionId,
        targetType: 'EMPATHY_DRAFT',
        targetId: draft.id,
        requestedByUserId: user.id,
        decision: consent ? 'GRANTED' : 'DENIED',
        decidedAt: new Date(),
      },
    });

    // Create empathy attempt (shared copy)
    const empathyAttempt = await prisma.empathyAttempt.create({
      data: {
        draftId: draft.id,
        sessionId,
        sourceUserId: user.id,
        content: draft.content,
        sharedAt: new Date(),
      },
    });

    // Get partner ID from session data
    const partnerId = getPartnerUserIdFromSession(session, user.id);

    // Get partner name for messages
    let partnerName: string | undefined;
    if (partnerId) {
      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { firstName: true, name: true },
      });
      partnerName = partner?.firstName || partner?.name || undefined;
    }

    // Save empathy statement as a message in the chat history
    // This creates the "Empathy statement sent" line with the statement content
    const empathyMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: user.id,
        forUserId: user.id,
        role: 'EMPATHY_STATEMENT', // Special role for empathy statements
        content: draft.content,
        stage: 2,
      },
    });

    // Embed for cross-session retrieval (non-blocking)
    embedMessage(empathyMessage.id).catch((err) =>
      console.warn('[consentToShare] Failed to embed empathy statement:', err)
    );

    // Summarize older parts of the conversation (non-blocking)
    // Empathy statements are persisted as chat messages, so they should be included in the rolling summary.
    updateSessionSummary(sessionId, user.id).catch((err) =>
      console.warn('[consentToShare] Failed to update session summary:', err)
    );

    // Check if partner has also consented (only if we have a partner)
    let partnerAttempt = null;
    if (partnerId) {
      partnerAttempt = await prisma.empathyAttempt.findFirst({
        where: {
          sessionId,
          sourceUserId: partnerId,
        },
      });

      // If both have shared, kick off reconciler in the background
      if (partnerAttempt) {
        runReconciler(sessionId, user.id).catch((err) =>
          console.warn('[consentToShare] Failed to run reconciler after both shared:', err)
        );
      }
    }

    // Create notification for partner
    if (partnerId) {
      await notifyEmpathyShared(
        partnerId,
        user.name || 'Your partner',
        sessionId
      ).catch((err) =>
        console.warn('[consentToShare] Failed to create notification:', err)
      );

      // Also notify via real-time
      await notifyPartner(sessionId, partnerId, 'partner.empathy_shared', {
        stage: 2,
        sharedBy: user.id,
      });
    }

    // Generate transition message when user shares empathy
    let transitionMessage: {
      id: string;
      content: string;
      timestamp: string;
      stage: number;
    } | null = null;

    try {
      const userName = user.firstName || user.name || 'The user';
      const partner = partnerName || 'their partner';

      const bothShared = !!partnerAttempt;

      // Build a transition prompt for empathy sharing acknowledgment
      const transitionPrompt = bothShared
        ? `You are Meet Without Fear, a Process Guardian. ${userName} has just shared their empathy statement with ${partner}. ${partner} has also shared their empathy statement.

Generate a brief, warm message (2-3 sentences) for ${userName} that:
1. Acknowledges the courage it took to share their understanding
2. Notes that both empathy statements are now shared
3. Clearly explains the next step: they'll read ${partner}'s empathy statement and mark whether it feels accurate (validation). If it feels inaccurate, they can give brief feedback; if accurate, they'll be able to advance to the next stage together.

Keep it natural and conversational. Don't be overly effusive.

Respond in JSON format:
\`\`\`json
{
  "response": "Your message"
}
\`\`\``
        : `You are Meet Without Fear, a Process Guardian. ${userName} has just shared their empathy statement with ${partner}, expressing their understanding of ${partner}'s perspective.

Generate a brief, warm acknowledgment message (2-3 sentences) for ${userName} that:
1. Acknowledges the courage it took to share their understanding
2. Validates the importance of this step in building connection
3. Gently prepares them for what comes next: now ${partner} will work on sharing THEIR understanding of ${userName}'s perspective (not responding to what was shared, but creating their own empathy statement)
4. Suggest they can use Inner Thoughts to continue processing privately while they wait - a space for personal reflection that's connected to this conversation

Keep it natural and conversational. Don't be overly effusive. Make it clear that both partners share empathy statements before moving forward together.

Respond in JSON format:
\`\`\`json
{
  "response": "Your acknowledgment message"
}
\`\`\``;

      const aiResponse = await getSonnetResponse({
        systemPrompt: transitionPrompt,
        messages: [{ role: 'user', content: 'Generate the acknowledgment message.' }],
        maxTokens: 512,
        sessionId,
        operation: 'stage2-transition',
      });

      let transitionContent: string;
      if (aiResponse) {
        try {
          const parsed = extractJsonFromResponse(aiResponse) as Record<string, unknown>;
          transitionContent = typeof parsed.response === 'string'
            ? parsed.response
            : bothShared
              ? `Thank you for sharing your understanding. Now you can read ${partnerName || 'your partner'}'s empathy statement and mark whether it feels accurate.`
              : `That took courage - sharing how you understand ${partnerName || 'your partner'}'s perspective. Now ${partnerName || 'your partner'} will share their understanding of yours. While you wait, you can use Inner Thoughts to continue processing privately.`;
        } catch {
          transitionContent = bothShared
            ? `Thank you for sharing your understanding. Now you can read ${partnerName || 'your partner'}'s empathy statement and mark whether it feels accurate.`
            : `That took courage - sharing how you understand ${partnerName || 'your partner'}'s perspective. Now ${partnerName || 'your partner'} will share their understanding of yours. While you wait, you can use Inner Thoughts to continue processing privately.`;
        }
      } else {
        transitionContent = bothShared
          ? `Thank you for sharing your understanding. Now you can read ${partnerName || 'your partner'}'s empathy statement and mark whether it feels accurate.`
          : `That took courage - sharing how you understand ${partnerName || 'your partner'}'s perspective. Now ${partnerName || 'your partner'} will share their understanding of yours. While you wait, you can use Inner Thoughts to continue processing privately.`;
      }

      // Save the transition message to the database
      const aiMessage = await prisma.message.create({
        data: {
          sessionId,
          senderId: null,
          forUserId: user.id,
          role: 'AI',
          content: transitionContent,
          stage: 2,
        },
      });

      // Embed for cross-session retrieval (non-blocking)
      embedMessage(aiMessage.id).catch((err) =>
        console.warn('[consentToShare] Failed to embed transition message:', err)
      );

      // Summarize older parts of the conversation (non-blocking)
      updateSessionSummary(sessionId, user.id).catch((err) =>
        console.warn('[consentToShare] Failed to update session summary after transition:', err)
      );

      transitionMessage = {
        id: aiMessage.id,
        content: aiMessage.content,
        timestamp: aiMessage.timestamp.toISOString(),
        stage: aiMessage.stage,
      };

      console.log(`[consentToShare] Generated transition message for session ${sessionId}`);
    } catch (error) {
      console.error('[consentToShare] Failed to generate transition message:', error);
      // Continue without transition message - not a critical failure
    }

    successResponse(res, {
      consented: consent,
      consentedAt: empathyAttempt.sharedAt?.toISOString() ?? null,
      partnerConsented: !!partnerAttempt,
      canReveal: !!partnerAttempt && consent,
      empathyMessage: {
        id: empathyMessage.id,
        content: empathyMessage.content,
        timestamp: empathyMessage.timestamp.toISOString(),
        stage: empathyMessage.stage,
      },
      transitionMessage,
    });
  } catch (error) {
    console.error('[consentToShare] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to consent to share', 500);
  }
}

/**
 * Get partner's empathy attempt
 * GET /sessions/:id/empathy/partner
 */
export async function getPartnerEmpathy(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      include: {
        relationship: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Get partner's user ID from session data
    const partnerId = getPartnerUserIdFromSession(session, user.id);

    // Get partner's empathy attempt
    const partnerAttempt = await prisma.empathyAttempt.findFirst({
      where: {
        sessionId,
        sourceUserId: partnerId ?? undefined,
      },
    });

    // Determine whether current user has validated partner attempt
    const validation = partnerAttempt
      ? await prisma.empathyValidation.findUnique({
        where: {
          attemptId_userId: {
            attemptId: partnerAttempt.id,
            userId: user.id,
          },
        },
      })
      : null;

    successResponse(res, {
      attempt: partnerAttempt
        ? {
          id: partnerAttempt.id,
          sourceUserId: partnerAttempt.sourceUserId ?? '',
          content: partnerAttempt.content,
          sharedAt: partnerAttempt.sharedAt.toISOString(),
          consentRecordId: partnerAttempt.consentRecordId ?? '',
        }
        : null,
      waitingForPartner: !partnerAttempt,
      validated: validation ? validation.validated : false,
      validatedAt: validation?.validatedAt?.toISOString() ?? null,
      awaitingRevision: validation ? validation.validated === false : false,
    });
  } catch (error) {
    console.error('[getPartnerEmpathy] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get partner empathy', 500);
  }
}

/**
 * Validate partner's empathy attempt
 * POST /sessions/:id/empathy/validate
 */
export async function validateEmpathy(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = validateEmpathyRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { validated, feedback } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
      include: {
        relationship: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session allows validation
    // Allow ACTIVE status for all users, and INVITED status for the session creator
    if (session.status !== 'ACTIVE') {
      if (session.status === 'INVITED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }
        // Creator can proceed while session is INVITED
      } else {
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 2
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 2) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot validate empathy: you are in stage ${currentStage}, but stage 2 is required`,
        400
      );
      return;
    }

    // Get partner ID from session data
    const partnerId = getPartnerUserIdFromSession(session, user.id);

    // Get partner's empathy attempt
    const partnerAttempt = await prisma.empathyAttempt.findFirst({
      where: {
        sessionId,
        sourceUserId: partnerId ?? undefined,
      },
    });

    if (!partnerAttempt) {
      errorResponse(res, 'NOT_FOUND', 'Partner empathy attempt not found', 404);
      return;
    }

    const now = new Date();

    // Create or update validation record (unique on attemptId+userId)
    const validationRecord = await prisma.empathyValidation.upsert({
      where: {
        attemptId_userId: {
          attemptId: partnerAttempt.id,
          userId: user.id,
        },
      },
      create: {
        attemptId: partnerAttempt.id,
        sessionId,
        userId: user.id,
        validated,
        feedback,
        validatedAt: now,
      },
      update: {
        validated,
        feedback,
        validatedAt: now,
      },
    });

    // Update stage progress gates
    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 2,
        },
      },
      data: {
        gatesSatisfied: {
          empathyValidated: validated,
          validatedAt: now.toISOString(),
        },
      },
    });

    // Notify partner
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.stage_completed', {
        stage: 2,
        validated,
        completedBy: user.id,
      });
    }

    // Determine whether partner has validated my empathy attempt
    const myAttempt = await prisma.empathyAttempt.findFirst({
      where: {
        sessionId,
        sourceUserId: user.id,
      },
    });
    const partnerValidation = partnerId && myAttempt
      ? await prisma.empathyValidation.findUnique({
        where: {
          attemptId_userId: {
            attemptId: myAttempt.id,
            userId: partnerId,
          },
        },
      })
      : null;

    successResponse(res, {
      validated,
      validatedAt: now.toISOString(),
      feedbackShared: validationRecord.feedbackShared,
      awaitingRevision: validated === false,
      canAdvance: validated,
      partnerValidated: partnerValidation ? partnerValidation.validated : false,
    });
  } catch (error) {
    console.error('[validateEmpathy] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to validate empathy', 500);
  }
}
