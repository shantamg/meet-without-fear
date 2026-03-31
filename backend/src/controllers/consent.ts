/**
 * Consent Controller
 *
 * Handles consent management operations:
 * - GET /sessions/:id/consent/pending - Get pending consent requests
 * - POST /sessions/:id/consent/decide - Grant or deny consent
 * - POST /sessions/:id/consent/revoke - Revoke previously granted consent
 * - GET /sessions/:id/consent/history - Get consent history
 */

import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { ErrorCode, ConsentDecision } from '@meet-without-fear/shared';
import { notifyPartner } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';

// ============================================================================
// Controllers
// ============================================================================

/**
 * Get pending consent requests
 * GET /sessions/:id/consent/pending
 */
export async function getPendingConsents(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Get pending consent requests for this user in this session
    const pendingRequests = await prisma.consentRecord.findMany({
      where: {
        sessionId,
        userId: user.id,
        decision: null, // No decision made yet
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, {
      pendingRequests: pendingRequests.map((r) => ({
        id: r.id,
        contentType: r.targetType,
        targetId: r.targetId,
        createdAt: r.createdAt.toISOString(),
        metadata: r.metadata,
      })),
    });
  } catch (error) {
    logger.error('[getPendingConsents] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get pending consents', 500);
  }
}

/**
 * Decide on a consent request (grant or deny)
 * POST /sessions/:id/consent/decide
 */
export async function decideConsent(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;
    const { consentRequestId, decision, editedContent } = req.body;

    // Validate decision
    if (!['GRANTED', 'DENIED'].includes(decision)) {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Decision must be GRANTED or DENIED', 400);
      return;
    }

    // Find the consent request
    const consentRecord = await prisma.consentRecord.findFirst({
      where: {
        id: consentRequestId,
        sessionId,
        userId: user.id,
        decision: null, // Not yet decided
      },
    });

    if (!consentRecord) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Consent request not found', 404);
      return;
    }

    const now = new Date();

    // Wrap all DB writes in a transaction for atomicity.
    // When GRANTED, the consent record update, shared vessel upsert, and
    // consented content creation must all succeed or all fail together.
    const { updatedConsent, sharedContent } = await prisma.$transaction(async (tx) => {
      // Update the consent record
      const updated = await tx.consentRecord.update({
        where: { id: consentRequestId },
        data: {
          decision: decision as ConsentDecision,
          decidedAt: now,
        },
      });

      let content = null;

      // If granted, create consented content in the shared vessel
      if (decision === 'GRANTED') {
        // Get or create shared vessel
        const sharedVessel = await tx.sharedVessel.upsert({
          where: { sessionId },
          create: { sessionId },
          update: {},
        });

        // Create consented content entry
        content = await tx.consentedContent.create({
          data: {
            sharedVesselId: sharedVessel.id,
            sourceUserId: user.id,
            transformedContent: editedContent || '', // Content transformation handled by AI
            consentRecordId: consentRequestId,
            consentedAt: now,
            consentActive: true,
          },
        });
      }

      return { updatedConsent: updated, sharedContent: content };
    });

    // Notification stays outside the transaction to avoid holding the DB
    // connection open during network I/O.
    if (decision === 'GRANTED') {
      const partnerId = await getPartnerUserId(sessionId, user.id);
      if (partnerId) {
        await notifyPartner(sessionId, partnerId, 'partner.consent_granted', {
          contentType: consentRecord.targetType,
          consentedAt: now.toISOString(),
        });
      }
    }

    successResponse(res, {
      recorded: true,
      consentRecord: {
        id: updatedConsent.id,
        contentType: updatedConsent.targetType,
        decision: updatedConsent.decision,
        decidedAt: updatedConsent.decidedAt?.toISOString() ?? null,
        revokedAt: updatedConsent.revokedAt?.toISOString() ?? null,
      },
      sharedContent: sharedContent
        ? {
            id: sharedContent.id,
            sourceUserId: sharedContent.sourceUserId,
            transformedContent: sharedContent.transformedContent,
            consentedAt: sharedContent.consentedAt.toISOString(),
            consentActive: sharedContent.consentActive,
          }
        : null,
    });
  } catch (error) {
    logger.error('[decideConsent] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to record consent decision', 500);
  }
}

/**
 * Revoke previously granted consent
 * POST /sessions/:id/consent/revoke
 */
export async function revokeConsent(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;
    const { consentRecordId } = req.body;

    // Find the consent record
    const consentRecord = await prisma.consentRecord.findFirst({
      where: {
        id: consentRecordId,
        sessionId,
        userId: user.id,
        decision: 'GRANTED',
        revokedAt: null, // Not already revoked
      },
    });

    if (!consentRecord) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Granted consent record not found', 404);
      return;
    }

    const now = new Date();

    // Wrap the consent revocation and content deactivation in a transaction.
    // Both must succeed together — revoking consent without deactivating
    // content would leave stale shared data visible to the partner.
    await prisma.$transaction(async (tx) => {
      // Update consent record to revoked
      await tx.consentRecord.update({
        where: { id: consentRecordId },
        data: { revokedAt: now },
      });

      // Mark all related consented content as inactive
      await tx.consentedContent.updateMany({
        where: { consentRecordId },
        data: {
          consentActive: false,
          revokedAt: now,
        },
      });
    });

    // Notification stays outside the transaction to avoid holding the DB
    // connection open during network I/O.
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.consent_revoked', {
        contentType: consentRecord.targetType,
        revokedAt: now.toISOString(),
      });
    }

    successResponse(res, {
      revoked: true,
      revokedAt: now.toISOString(),
    });
  } catch (error) {
    logger.error('[revokeConsent] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to revoke consent', 500);
  }
}

/**
 * Get consent history for the session
 * GET /sessions/:id/consent/history
 */
export async function getConsentHistory(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Get all consent records for this user in this session
    const records = await prisma.consentRecord.findMany({
      where: {
        sessionId,
        userId: user.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, {
      records: records.map((r) => ({
        id: r.id,
        contentType: r.targetType,
        targetId: r.targetId,
        decision: r.decision,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        revokedAt: r.revokedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error('[getConsentHistory] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get consent history', 500);
  }
}
