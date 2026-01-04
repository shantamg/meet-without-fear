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
import { notifyEmpathyShared } from '../services/notification';

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

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
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
        readyToShare,
        version: 1,
      },
      update: {
        content,
        readyToShare,
        version: { increment: 1 },
      },
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

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
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

    // Check if partner has also consented
    const partnerAttempt = await prisma.empathyAttempt.findFirst({
      where: {
        sessionId,
        sourceUserId: partnerId ?? undefined,
      },
    });

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

      // Build a simple transition prompt for empathy sharing acknowledgment
      const transitionPrompt = `You are Meet Without Fear, a Process Guardian. ${userName} has just shared their empathy statement with ${partner}, expressing their understanding of ${partner}'s perspective.

Generate a brief, warm acknowledgment message (2-3 sentences) for ${userName} that:
1. Acknowledges the courage it took to share their understanding
2. Validates the importance of this step in building connection
3. Gently prepares them for what comes next (waiting for ${partner} to receive and respond to their understanding)

Keep it natural and conversational. Don't be overly effusive.

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
      });

      let transitionContent: string;
      if (aiResponse) {
        try {
          const parsed = extractJsonFromResponse(aiResponse) as Record<string, unknown>;
          transitionContent = typeof parsed.response === 'string'
            ? parsed.response
            : `That took courage - sharing how you understand ${partnerName || 'your partner'}'s perspective. Now we wait to see how they receive it.`;
        } catch {
          transitionContent = `That took courage - sharing how you understand ${partnerName || 'your partner'}'s perspective. Now we wait to see how they receive it.`;
        }
      } else {
        transitionContent = `That took courage - sharing how you understand ${partnerName || 'your partner'}'s perspective. Now we wait to see how they receive it.`;
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

    successResponse(res, {
      partnerEmpathy: partnerAttempt
        ? {
            id: partnerAttempt.id,
            content: partnerAttempt.content,
            sharedAt: partnerAttempt.sharedAt?.toISOString() ?? null,
          }
        : null,
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

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
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

    // Create validation record
    await prisma.empathyValidation.create({
      data: {
        attemptId: partnerAttempt.id,
        sessionId,
        userId: user.id,
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

    successResponse(res, {
      validated,
      validatedAt: now.toISOString(),
      canAdvance: validated,
    });
  } catch (error) {
    console.error('[validateEmpathy] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to validate empathy', 500);
  }
}
