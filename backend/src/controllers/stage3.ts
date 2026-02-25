/**
 * Stage 3 Controller
 *
 * Handles the Need Mapping stage endpoints:
 * - GET /sessions/:id/needs - Get AI-synthesized needs
 * - POST /sessions/:id/needs/confirm - Confirm needs
 * - POST /sessions/:id/needs/consent - Consent to share needs
 * - GET /sessions/:id/common-ground - Get common ground analysis
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { extractNeedsFromConversation, findCommonGround } from '../services/needs';
import { confirmNeedsRequestSchema, ConsentContentType } from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';

// ============================================================================
// Extraction Lock (in-memory idempotency guard)
// ============================================================================

/**
 * Track in-progress needs extractions to prevent concurrent AI calls.
 * Key: `${sessionId}:${userId}`, Value: timestamp when extraction started.
 */
const extractionLocks = new Map<string, number>();
const EXTRACTION_LOCK_TIMEOUT_MS = 60_000; // 60 seconds max

function getExtractionKey(sessionId: string, userId: string): string {
  return `${sessionId}:${userId}`;
}

function isExtractionRunning(sessionId: string, userId: string): boolean {
  const key = getExtractionKey(sessionId, userId);
  const startedAt = extractionLocks.get(key);
  if (!startedAt) return false;
  // Auto-expire stale locks
  if (Date.now() - startedAt > EXTRACTION_LOCK_TIMEOUT_MS) {
    extractionLocks.delete(key);
    return false;
  }
  return true;
}

function setExtractionLock(sessionId: string, userId: string): void {
  extractionLocks.set(getExtractionKey(sessionId, userId), Date.now());
}

function clearExtractionLock(sessionId: string, userId: string): void {
  extractionLocks.delete(getExtractionKey(sessionId, userId));
}

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

// ============================================================================
// Controllers
// ============================================================================

/**
 * Get AI-synthesized needs for the current user
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
    let needs = await prisma.identifiedNeed.findMany({
      where: {
        vesselId: userVessel.id,
      },
      orderBy: { createdAt: 'asc' },
    });

    // If no needs exist, trigger AI extraction (with idempotency guard)
    if (needs.length === 0) {
      if (isExtractionRunning(sessionId, user.id)) {
        // Another request is already extracting - return loading state
        successResponse(res, {
          needs: [],
          extracting: true,
          synthesizedAt: null,
        });
        return;
      }

      setExtractionLock(sessionId, user.id);
      try {
        needs = await extractNeedsFromConversation(sessionId, user.id);
      } finally {
        clearExtractionLock(sessionId, user.id);
      }
    }

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
      synthesizedAt: needs[0]?.createdAt.toISOString() ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getNeeds] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get needs', 500);
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
    console.error('[confirmNeeds] Error:', error);
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
        commonGroundReady: partnerShared,
      });
    }

    // If both have shared, auto-trigger common ground analysis and notify
    if (partnerShared && partnerId) {
      // Trigger common ground analysis server-side to prevent race conditions
      // where GET /common-ground returns empty before analysis completes
      try {
        await findCommonGround(sessionId, user.id, partnerId);
        console.log('[consentToShareNeeds] Common ground analysis triggered for session', sessionId);
      } catch (err) {
        console.error('[consentToShareNeeds] Failed to trigger common ground analysis:', err);
        // Non-fatal - client can still trigger via GET /common-ground
      }

      await publishSessionEvent(sessionId, 'session.common_ground_ready', {
        stage: 3,
        commonGroundReady: true,
      });
    }

    successResponse(res, {
      consented: true,
      sharedAt: now.toISOString(),
      waitingForPartner: !partnerShared,
      commonGroundReady: partnerShared,
    });
  } catch (error) {
    console.error('[consentToShareNeeds] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to consent to share needs', 500);
  }
}

/**
 * Get common ground analysis between partners
 * GET /sessions/:id/common-ground
 */
export async function getCommonGround(
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

    // Return empty data for non-active sessions (allows parallel fetching without errors)
    if (session.status !== 'ACTIVE') {
      successResponse(res, {
        commonGround: [],
        analysisComplete: false,
        bothConfirmed: false,
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
        commonGround: [],
        analysisComplete: false,
        bothConfirmed: false,
      });
      return;
    }

    // Get partner ID
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (!partnerId) {
      errorResponse(res, 'INTERNAL_ERROR', 'Could not find partner', 500);
      return;
    }

    // Check if both partners have shared their needs
    const userGates = progress?.gatesSatisfied as Record<string, unknown> | null;
    const userShared = userGates?.needsShared === true;

    const partnerShared = await hasPartnerSharedNeeds(sessionId, user.id);

    // If either hasn't shared, return waiting state
    if (!userShared || !partnerShared) {
      successResponse(res, {
        commonGround: [],
        analysisComplete: false,
        bothConfirmed: false,
        waitingFor: !userShared ? 'self' : 'partner',
      });
      return;
    }

    // Get or create shared vessel
    let sharedVessel = await prisma.sharedVessel.findUnique({
      where: { sessionId },
    });

    if (!sharedVessel) {
      sharedVessel = await prisma.sharedVessel.create({
        data: { sessionId },
      });
    }

    // Get existing common ground
    let commonGround = await prisma.commonGround.findMany({
      where: { sharedVesselId: sharedVessel.id },
      orderBy: { id: 'asc' },
    });

    // If no common ground exists, trigger AI analysis
    let analysisRan = false;
    if (commonGround.length === 0) {
      commonGround = await findCommonGround(sessionId, user.id, partnerId);
      analysisRan = true;
    }

    // Handle zero common ground (AI found no overlap)
    if (commonGround.length === 0 && analysisRan) {
      successResponse(res, {
        commonGround: [],
        analysisComplete: true,
        bothConfirmed: false,
        noOverlap: true,
      });
      return;
    }

    // Determine which user is "A" and which is "B" (based on order of members)
    const members = session.relationship.members;
    const userIsA = members[0]?.userId === user.id;

    // Determine if both have confirmed all common ground
    const allConfirmed = commonGround.every(
      (cg) => cg.confirmedByA && cg.confirmedByB
    );

    successResponse(res, {
      commonGround: commonGround.map((cg) => ({
        id: cg.id,
        category: cg.category,
        need: cg.need,
        description: cg.need, // Alias for compatibility
        confirmedByMe: userIsA ? cg.confirmedByA : cg.confirmedByB,
        confirmedByPartner: userIsA ? cg.confirmedByB : cg.confirmedByA,
        confirmedAt: cg.confirmedAt?.toISOString() ?? null,
      })),
      analysisComplete: true,
      bothConfirmed: allConfirmed,
      noOverlap: false,
    });
  } catch (error) {
    console.error('[getCommonGround] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get common ground', 500);
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
    console.error('[addCustomNeed] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to add custom need', 500);
  }
}

/**
 * Confirm common ground
 * POST /sessions/:id/common-ground/confirm
 */
export async function confirmCommonGround(
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
    // Accept both 'commonGroundIds' (legacy) and 'confirmations' (current mobile DTO)
    const { commonGroundIds, confirmations } = req.body as {
      commonGroundIds?: string[];
      confirmations?: { commonGroundId: string; confirmed: boolean }[];
    };

    // Normalize: extract IDs from confirmations if commonGroundIds not provided
    const resolvedIds: string[] = commonGroundIds && Array.isArray(commonGroundIds) && commonGroundIds.length > 0
      ? commonGroundIds
      : Array.isArray(confirmations)
        ? confirmations.filter((c) => c.confirmed).map((c) => c.commonGroundId)
        : [];

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
        `Cannot confirm common ground: you are in stage ${currentStage}, but stage 3 is required`,
        400
      );
      return;
    }

    // Get shared vessel
    const sharedVessel = await prisma.sharedVessel.findUnique({
      where: { sessionId },
    });

    if (!sharedVessel) {
      errorResponse(res, 'NOT_FOUND', 'Shared vessel not found', 404);
      return;
    }

    // Check for noOverlap case: no CommonGround records exist for this session
    const existingCommonGround = await prisma.commonGround.findMany({
      where: { sharedVesselId: sharedVessel.id },
    });

    const isNoOverlap = existingCommonGround.length === 0;

    // If no IDs provided and this is NOT a noOverlap case, reject
    if (resolvedIds.length === 0 && !isNoOverlap) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'commonGroundIds array is required when common ground exists',
        400
      );
      return;
    }

    // Determine if user is A or B
    const members = session.relationship.members;
    const userIsA = members[0]?.userId === user.id;

    const now = new Date();

    if (isNoOverlap) {
      // noOverlap case: no common ground to confirm, proceed directly to stage transition
      console.log('[confirmCommonGround] noOverlap case - advancing Stage 3->4 for session', sessionId);

      // Mark this user's Stage 3 as having confirmed (even though there's nothing to confirm)
      const gatesSatisfied = {
        ...(progress?.gatesSatisfied as Record<string, unknown> || {}),
        commonGroundConfirmed: true,
        confirmedAt: now.toISOString(),
        noOverlap: true,
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
          status: 'COMPLETED',
          completedAt: now,
        },
      });

      // Check if partner has also confirmed (or confirm for both in noOverlap)
      const partnerId = await getPartnerUserId(sessionId, user.id);

      // In noOverlap case, also mark partner's Stage 3 as completed and advance both to Stage 4
      if (partnerId) {
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

        // Create Stage 4 progress records for both users
        const userIds = [user.id, partnerId];
        for (const uid of userIds) {
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

        // Generate transition message for each user
        const transitionContent =
          "Even though your needs don't overlap directly, that's okay -- understanding " +
          "each other's needs is itself a breakthrough. Let's move to the final stage: " +
          "building concrete strategies and agreements that honor what you both need.";

        const transitionMessages: Array<{ id: string; content: string; timestamp: Date }> = [];
        for (const uid of userIds) {
          const msg = await prisma.message.create({
            data: {
              sessionId,
              senderId: null,
              forUserId: uid,
              role: 'AI',
              content: transitionContent,
              stage: 4,
            },
          });
          transitionMessages.push({ id: msg.id, content: msg.content, timestamp: msg.timestamp });
        }

        // Publish stage completed event
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

        // Notify partner
        await notifyPartner(sessionId, partnerId, 'partner.common_ground_confirmed', {
          stage: 3,
          confirmedBy: user.id,
          allConfirmedByBoth: true,
          noOverlap: true,
        });

        console.log('[confirmCommonGround] noOverlap Stage 3->4 transition completed for session', sessionId);
      }

      successResponse(res, {
        confirmed: true,
        confirmedAt: now.toISOString(),
        allConfirmedByMe: true,
        allConfirmedByBoth: true,
        canAdvance: true,
        noOverlap: true,
      });
      return;
    }

    // Normal case: update confirmation status for each common ground
    for (const cgId of resolvedIds) {
      const cg = await prisma.commonGround.findUnique({
        where: { id: cgId },
      });

      if (!cg || cg.sharedVesselId !== sharedVessel.id) {
        continue; // Skip invalid IDs
      }

      // Update confirmation based on user's slot
      const updateData: Prisma.CommonGroundUpdateInput = userIsA
        ? { confirmedByA: true }
        : { confirmedByB: true };

      // If both have now confirmed, set confirmedAt
      const willBothConfirm = userIsA
        ? cg.confirmedByB
        : cg.confirmedByA;

      if (willBothConfirm) {
        updateData.confirmedAt = now;
      }

      await prisma.commonGround.update({
        where: { id: cgId },
        data: updateData,
      });
    }

    // Get all common ground to check if all are confirmed
    const allCommonGround = await prisma.commonGround.findMany({
      where: { sharedVesselId: sharedVessel.id },
    });

    const allConfirmedByMe = allCommonGround.every((cg) =>
      userIsA ? cg.confirmedByA : cg.confirmedByB
    );

    const allConfirmedByBoth = allCommonGround.every(
      (cg) => cg.confirmedByA && cg.confirmedByB
    );

    // Update stage progress if all confirmed by me
    if (allConfirmedByMe) {
      const gatesSatisfied = {
        ...(progress?.gatesSatisfied as Record<string, unknown> || {}),
        commonGroundConfirmed: true,
        confirmedAt: now.toISOString(),
        commonGroundFoundAt: now.toISOString(),
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
          status: allConfirmedByBoth ? 'COMPLETED' : 'GATE_PENDING',
          completedAt: allConfirmedByBoth ? now : null,
        },
      });
    }

    // Notify partner
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.common_ground_confirmed', {
        stage: 3,
        confirmedBy: user.id,
        allConfirmedByBoth,
      });
    }

    // If both confirmed all common ground, trigger Stage 3 -> 4 transition
    if (allConfirmedByBoth && partnerId) {
      try {
        // Also mark partner's Stage 3 as COMPLETED (they may not have updated yet)
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

        // Create Stage 4 progress records for both users
        const userIds = [user.id, partnerId];
        for (const uid of userIds) {
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

        // Generate transition message for each user
        const transitionContent =
          "You've found common ground together -- that's a real breakthrough. " +
          "Now let's move to the final stage: building concrete strategies and agreements " +
          "that honor what you both need.";

        const transitionMessages: Array<{ id: string; content: string; timestamp: Date }> = [];
        for (const uid of userIds) {
          const msg = await prisma.message.create({
            data: {
              sessionId,
              senderId: null,
              forUserId: uid,
              role: 'AI',
              content: transitionContent,
              stage: 4,
            },
          });
          transitionMessages.push({ id: msg.id, content: msg.content, timestamp: msg.timestamp });
        }

        // Publish stage completed event
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

        console.log('[confirmCommonGround] Stage 3->4 transition completed for session', sessionId);
      } catch (err) {
        console.error('[confirmCommonGround] Failed to trigger Stage 3->4 transition:', err);
        // Non-fatal - the transition can be triggered manually
      }
    }

    successResponse(res, {
      confirmed: true,
      confirmedAt: now.toISOString(),
      allConfirmedByMe,
      allConfirmedByBoth,
      canAdvance: allConfirmedByBoth,
    });
  } catch (error) {
    console.error('[confirmCommonGround] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm common ground', 500);
  }
}
