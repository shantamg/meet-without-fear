/**
 * Stage 3 Controller
 *
 * Handles the What Matters stage endpoints:
 * - GET /sessions/:id/needs - Get identified needs (simple read)
 * - POST /sessions/:id/needs/capture - Capture needs from an AI summary card
 * - POST /sessions/:id/needs/confirm - Confirm needs
 * - POST /sessions/:id/needs/consent - Consent to share needs
 * - POST /sessions/:id/needs/validate - Validate revealed needs
 * - POST /sessions/:id/needs - Add custom need
 * - GET /sessions/:id/needs/comparison - Side-by-side needs comparison
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { confirmNeedsRequestSchema, ConsentContentType, NeedCategory } from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get or create user vessel for a session
 */
async function getOrCreateUserVessel(
  sessionId: string,
  userId: string
): Promise<{ id: string }> {
  let vessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: { userId, sessionId },
    },
  });

  if (!vessel) {
    vessel = await prisma.userVessel.create({
      data: { userId, sessionId },
    });
  }

  return vessel;
}

/**
 * Check if partner has shared their needs (consented to share)
 */
async function hasPartnerSharedNeeds(
  sessionId: string,
  currentUserId: string
): Promise<boolean> {
  const partnerId = await getPartnerUserId(sessionId, currentUserId);
  if (!partnerId) return false;

  const partnerProgress = await prisma.stageProgress.findUnique({
    where: {
      sessionId_userId_stage: {
        sessionId,
        userId: partnerId,
        stage: 3,
      },
    },
  });

  if (!partnerProgress) return false;

  const gates = partnerProgress.gatesSatisfied as Record<string, unknown> | null;
  return gates?.needsShared === true;
}

async function hasPartnerValidatedNeeds(
  sessionId: string,
  currentUserId: string
): Promise<boolean> {
  const partnerId = await getPartnerUserId(sessionId, currentUserId);
  if (!partnerId) return false;

  const partnerProgress = await prisma.stageProgress.findUnique({
    where: {
      sessionId_userId_stage: {
        sessionId,
        userId: partnerId,
        stage: 3,
      },
    },
  });

  const gates = partnerProgress?.gatesSatisfied as Record<string, unknown> | null;
  return gates?.needsValidated === true;
}

function isNeedCategory(value: unknown): value is NeedCategory {
  return typeof value === 'string' && Object.values(NeedCategory).includes(value as NeedCategory);
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Get identified needs for the current user (simple read, no auto-extraction)
 * GET /sessions/:id/needs
 */
export async function getNeeds(req: Request, res: Response): Promise<void> {
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

    // Return empty data for non-active sessions (allows parallel fetching)
    if (session.status !== 'ACTIVE') {
      successResponse(res, {
        needs: [],
        synthesizedAt: null,
        isDirty: false,
      });
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
      },
      orderBy: { stage: 'desc' },
    });

    // If not in stage 3 yet, return empty data instead of error
    const currentStage = progress?.stage ?? 0;
    if (currentStage < 3) {
      successResponse(res, {
        needs: [],
        synthesizedAt: null,
        isDirty: false,
      });
      return;
    }

    // Get user's vessel
    const userVessel = await getOrCreateUserVessel(sessionId, user.id);

    // Get existing needs for this user
    const needs = await prisma.identifiedNeed.findMany({
      where: {
        vesselId: userVessel.id,
      },
      orderBy: { createdAt: 'asc' },
    });

    successResponse(res, {
      needs: needs.map((n) => ({
        id: n.id,
        category: n.category,
        need: n.need,
        description: n.need, // Alias for compatibility
        evidence: n.evidence,
        aiConfidence: n.aiConfidence,
        confirmed: n.confirmed,
        createdAt: n.createdAt.toISOString(),
      })),
      extracting: false,
      synthesizedAt: needs[0]?.createdAt.toISOString() ?? null,
    });
  } catch (error) {
    logger.error('[getNeeds] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get needs', 500);
  }
}

/**
 * Capture needs from an AI summary card
 * POST /sessions/:id/needs/capture
 */
export async function captureNeeds(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const { needs } = req.body as {
      needs?: Array<{
        need?: string;
        category?: unknown;
        description?: string;
        evidence?: unknown;
      }>;
    };

    if (!Array.isArray(needs) || needs.length === 0) {
      errorResponse(res, 'VALIDATION_ERROR', 'needs array is required', 400);
      return;
    }

    for (const need of needs) {
      if (!need.need || !need.description || !isNeedCategory(need.category)) {
        errorResponse(
          res,
          'VALIDATION_ERROR',
          'Each need requires need, description, and a valid category',
          400
        );
        return;
      }
    }

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

    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    const progress = await prisma.stageProgress.findFirst({
      where: { sessionId, userId: user.id },
      orderBy: { stage: 'desc' },
    });

    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 3) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot capture needs: you are in stage ${currentStage}, but stage 3 is required`,
        400
      );
      return;
    }

    const userVessel = await getOrCreateUserVessel(sessionId, user.id);
    const now = new Date();

    const capturedNeeds = [];
    for (const item of needs) {
      const evidence = Array.isArray(item.evidence)
        ? item.evidence.filter((entry): entry is string => typeof entry === 'string')
        : [];

      const created = await prisma.identifiedNeed.create({
        data: {
          vesselId: userVessel.id,
          need: item.description || item.need!,
          category: item.category as NeedCategory,
          evidence,
          aiConfidence: 0.85,
          confirmed: false,
        },
      });
      capturedNeeds.push(created);
    }

    successResponse(
      res,
      {
        needs: capturedNeeds.map((n) => ({
          id: n.id,
          need: n.need,
          category: n.category,
          description: n.need,
          evidence: n.evidence,
          confirmed: n.confirmed,
          aiConfidence: n.aiConfidence,
        })),
        capturedAt: now.toISOString(),
      },
      201
    );
  } catch (error) {
    logger.error('[captureNeeds] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to capture needs', 500);
  }
}

/**
 * Confirm user's needs
 * POST /sessions/:id/needs/confirm
 */
export async function confirmNeeds(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = confirmNeedsRequestSchema.safeParse(req.body);
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

    const { needIds, adjustments } = parseResult.data;

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
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 3
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 3) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot confirm needs: you are in stage ${currentStage}, but stage 3 is required`,
        400
      );
      return;
    }

    // Get user's vessel
    const userVessel = await getOrCreateUserVessel(sessionId, user.id);

    // Verify the needs belong to this user's vessel
    const userNeeds = await prisma.identifiedNeed.findMany({
      where: {
        id: { in: needIds },
        vesselId: userVessel.id,
      },
    });

    if (userNeeds.length !== needIds.length) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Some need IDs are invalid or do not belong to you',
        400
      );
      return;
    }

    // Process adjustments if provided
    if (adjustments && adjustments.length > 0) {
      for (const adj of adjustments) {
        if (adj.correction) {
          await prisma.identifiedNeed.update({
            where: { id: adj.needId },
            data: {
              need: adj.correction,
              confirmed: adj.confirmed,
            },
          });
        }
      }
    }

    // Confirm all specified needs
    await prisma.identifiedNeed.updateMany({
      where: {
        id: { in: needIds },
        vesselId: userVessel.id,
      },
      data: { confirmed: true },
    });

    // Update stage progress with needsIdentifiedAt milestone
    const now = new Date();
    const gatesSatisfied = {
      ...(progress?.gatesSatisfied as Record<string, unknown> || {}),
      needsConfirmed: true,
      confirmedAt: now.toISOString(),
      needsIdentifiedAt: now.toISOString(),
    } satisfies Prisma.InputJsonValue;

    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 3,
        },
      },
      data: {
        gatesSatisfied,
      },
    });

    // Notify partner that needs were confirmed
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.needs_confirmed', {
        stage: 3,
        confirmedBy: user.id,
      });
    }

    // Check if partner has also shared
    const partnerShared = await hasPartnerSharedNeeds(sessionId, user.id);

    successResponse(res, {
      confirmed: true,
      confirmedAt: now.toISOString(),
      partnerConfirmed: partnerShared,
      canAdvance: false, // Need to share needs first
    });
  } catch (error) {
    logger.error('[confirmNeeds] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm needs', 500);
  }
}

/**
 * Consent to share needs with partner
 * POST /sessions/:id/needs/consent
 */
export async function consentToShareNeeds(
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
    const { needIds } = req.body as { needIds?: string[] };

    if (!needIds || !Array.isArray(needIds) || needIds.length === 0) {
      errorResponse(res, 'VALIDATION_ERROR', 'needIds array is required', 400);
      return;
    }

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
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 3
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 3) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot consent to share: you are in stage ${currentStage}, but stage 3 is required`,
        400
      );
      return;
    }

    // Get user's vessel
    const userVessel = await getOrCreateUserVessel(sessionId, user.id);

    // Verify needs are confirmed
    const confirmedNeeds = await prisma.identifiedNeed.findMany({
      where: {
        id: { in: needIds },
        vesselId: userVessel.id,
        confirmed: true,
      },
    });

    if (confirmedNeeds.length !== needIds.length) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'All needs must be confirmed before sharing',
        400
      );
      return;
    }

    // Create consent records for each need
    const now = new Date();
    for (const needId of needIds) {
      await prisma.consentRecord.create({
        data: {
          sessionId,
          userId: user.id,
          targetType: ConsentContentType.IDENTIFIED_NEED,
          targetId: needId,
          requestedByUserId: user.id, // Self-initiated consent
          decision: 'GRANTED',
          decidedAt: now,
        },
      });
    }

    // Update stage progress
    const gatesSatisfied = {
      ...(progress?.gatesSatisfied as Record<string, unknown> || {}),
      needsShared: true,
      sharedAt: now.toISOString(),
    } satisfies Prisma.InputJsonValue;

    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 3,
        },
      },
      data: {
        gatesSatisfied,
        status: 'GATE_PENDING',
      },
    });

    // Check if partner has also shared
    const partnerShared = await hasPartnerSharedNeeds(sessionId, user.id);

    // Notify partner via real-time
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.needs_shared', {
        stage: 3,
        sharedBy: user.id,
        needsRevealReady: partnerShared,
      });
    }

    // If both have shared, notify clients that the side-by-side reveal is ready.
    if (partnerShared && partnerId) {
      await publishSessionEvent(sessionId, 'session.needs_reveal_ready', {
        stage: 3,
        needsRevealReady: true,
      });
    }

    successResponse(res, {
      consented: true,
      sharedAt: now.toISOString(),
      waitingForPartner: !partnerShared,
      needsRevealReady: partnerShared,
    });
  } catch (error) {
    logger.error('[consentToShareNeeds] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to consent to share needs', 500);
  }
}

/**
 * Validate revealed needs lists.
 * POST /sessions/:id/needs/validate
 */
export async function validateNeeds(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const { validated = true } = req.body as { validated?: boolean };

    if (typeof validated !== 'boolean') {
      errorResponse(res, 'VALIDATION_ERROR', 'validated boolean is required', 400);
      return;
    }

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
            members: {
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    const progress = await prisma.stageProgress.findFirst({
      where: { sessionId, userId: user.id },
      orderBy: { stage: 'desc' },
    });

    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 3) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot validate needs: you are in stage ${currentStage}, but stage 3 is required`,
        400
      );
      return;
    }

    const userGates = progress?.gatesSatisfied as Record<string, unknown> | null;
    if (userGates?.needsShared !== true || !(await hasPartnerSharedNeeds(sessionId, user.id))) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Both partners must consent to reveal needs before validation',
        400
      );
      return;
    }

    const now = new Date();
    const gatesSatisfied = {
      ...(progress?.gatesSatisfied as Record<string, unknown> || {}),
      needsValidated: validated,
      needsValidatedAt: validated ? now.toISOString() : null,
    } satisfies Prisma.InputJsonValue;

    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 3,
        },
      },
      data: {
        gatesSatisfied,
        status: 'GATE_PENDING',
        completedAt: null,
      },
    });

    const partnerValidated = await hasPartnerValidatedNeeds(sessionId, user.id);
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.needs_validated', {
        stage: 3,
        validatedBy: user.id,
        validated,
        allValidatedByBoth: validated && partnerValidated,
      });
    }

    const canAdvance = validated && partnerValidated;
    if (canAdvance && partnerId) {
      await prisma.stageProgress.updateMany({
        where: {
          sessionId,
          stage: 3,
          userId: { in: [user.id, partnerId] },
        },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      });

      for (const uid of [user.id, partnerId]) {
        await prisma.stageProgress.upsert({
          where: {
            sessionId_userId_stage: {
              sessionId,
              userId: uid,
              stage: 4,
            },
          },
          create: {
            sessionId,
            userId: uid,
            stage: 4,
            status: 'IN_PROGRESS',
            startedAt: now,
          },
          update: {},
        });
      }

      const transitionContent =
        'You have both checked the needs lists and marked them valid. Now move to strategies that can honor what each of you needs.';

      const transitionMessages: Array<{ id: string; content: string; timestamp: Date }> = [];
      for (const uid of [user.id, partnerId]) {
        const message = await prisma.message.create({
          data: {
            sessionId,
            senderId: null,
            forUserId: uid,
            role: 'AI',
            content: transitionContent,
            stage: 4,
          },
        });
        transitionMessages.push({ id: message.id, content: message.content, timestamp: message.timestamp });
      }

      const firstMessage = transitionMessages[0];
      await publishSessionEvent(sessionId, 'partner.stage_completed', {
        previousStage: 3,
        currentStage: 4,
        userId: user.id,
        triggeredByUserId: user.id,
        message: firstMessage
          ? {
              id: firstMessage.id,
              content: firstMessage.content,
              timestamp: firstMessage.timestamp,
            }
          : undefined,
      });
    }

    successResponse(res, {
      validated,
      validatedAt: validated ? now.toISOString() : null,
      partnerValidated,
      canAdvance,
    });
  } catch (error) {
    logger.error('[validateNeeds] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to validate needs', 500);
  }
}

/**
 * Add custom need
 * POST /sessions/:id/needs
 */
export async function addCustomNeed(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const { need, category, description } = req.body as {
      need?: string;
      category?: import('@meet-without-fear/shared').NeedCategory;
      description?: string;
    };

    if (!need || !category) {
      errorResponse(res, 'VALIDATION_ERROR', 'need and category are required', 400);
      return;
    }

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
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 3
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 3) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot add need: you are in stage ${currentStage}, but stage 3 is required`,
        400
      );
      return;
    }

    // Get user's vessel
    const userVessel = await getOrCreateUserVessel(sessionId, user.id);

    // Create custom need
    const customNeed = await prisma.identifiedNeed.create({
      data: {
        vesselId: userVessel.id,
        need,
        category: category as import('@meet-without-fear/shared').NeedCategory,
        evidence: [],
        aiConfidence: 1.0, // User-added needs are considered 100% confident
        confirmed: true, // User-added needs are auto-confirmed
      },
    });

    successResponse(res, {
      need: {
        id: customNeed.id,
        need: customNeed.need,
        category: customNeed.category,
        description: customNeed.need,
        evidence: customNeed.evidence,
        aiConfidence: customNeed.aiConfidence,
        confirmed: customNeed.confirmed,
      },
    }, 201);
  } catch (error) {
    logger.error('[addCustomNeed] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to add custom need', 500);
  }
}

/**
 * Get needs comparison (side-by-side view of both users' needs)
 * GET /sessions/:id/needs/comparison
 *
 * Only available after both users have shared their needs.
 */
export async function getNeedsComparison(
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

    if (session.status !== 'ACTIVE') {
      successResponse(res, {
        myNeeds: [],
        partnerNeeds: [],
        commonGround: [],
        analysisComplete: false,
        noOverlap: false,
      });
      return;
    }

    // Get user's stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: { sessionId, userId: user.id },
      orderBy: { stage: 'desc' },
    });

    const currentStage = progress?.stage ?? 0;
    if (currentStage < 3) {
      successResponse(res, {
        myNeeds: [],
        partnerNeeds: [],
        commonGround: [],
        analysisComplete: false,
        noOverlap: false,
      });
      return;
    }

    // Get partner ID
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (!partnerId) {
      errorResponse(res, 'INTERNAL_ERROR', 'Could not find partner', 500);
      return;
    }

    // Check both users have shared needs
    const userGates = progress?.gatesSatisfied as Record<string, unknown> | null;
    const userShared = userGates?.needsShared === true;
    const partnerShared = await hasPartnerSharedNeeds(sessionId, user.id);

    if (!userShared || !partnerShared) {
      successResponse(res, {
        myNeeds: [],
        partnerNeeds: [],
        commonGround: [],
        analysisComplete: false,
        noOverlap: false,
      });
      return;
    }

    // Fetch both users' vessels and needs
    const [myVessel, partnerVessel] = await Promise.all([
      getOrCreateUserVessel(sessionId, user.id),
      getOrCreateUserVessel(sessionId, partnerId),
    ]);

    const [myNeeds, partnerNeeds] = await Promise.all([
      prisma.identifiedNeed.findMany({
        where: { vesselId: myVessel.id },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.identifiedNeed.findMany({
        where: { vesselId: partnerVessel.id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const partnerProgress = await prisma.stageProgress.findUnique({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: partnerId,
          stage: 3,
        },
      },
    });
    const partnerGates = partnerProgress?.gatesSatisfied as Record<string, unknown> | null;

    successResponse(res, {
      myNeeds: myNeeds.map((n) => ({
        id: n.id,
        category: n.category,
        need: n.need,
        confirmed: n.confirmed,
      })),
      partnerNeeds: partnerNeeds.map((n) => ({
        id: n.id,
        category: n.category,
        need: n.need,
        confirmed: n.confirmed,
      })),
      myValidated: userGates?.needsValidated === true,
      partnerValidated: partnerGates?.needsValidated === true,
      canAdvance: userGates?.needsValidated === true && partnerGates?.needsValidated === true,
      commonGround: [],
      analysisComplete: true,
      noOverlap: false,
    });
  } catch (error) {
    logger.error('[getNeedsComparison] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get needs comparison', 500);
  }
}
