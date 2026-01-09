/**
 * Reconciler Controller
 *
 * Handles endpoints for the Empathy Reconciler system:
 * - POST /sessions/:id/reconciler/run - Run reconciler analysis
 * - GET /sessions/:id/reconciler/status - Get reconciler status
 * - GET /sessions/:id/reconciler/share-offer - Get pending share offer for user
 * - POST /sessions/:id/reconciler/share-offer/respond - Respond to share offer
 * - GET /sessions/:id/reconciler/summary - Get reconciler summary
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  runReconcilerRequestSchema,
  respondToShareOfferRequestSchema,
  type RunReconcilerResponse,
  type ReconcilerStatusResponse,
  type RespondToShareOfferResponse,
  type GetQuoteOptionsResponse,
  type ReconcilerSummary,
} from '@meet-without-fear/shared';
import {
  runReconciler,
  generateShareOffer,
  respondToShareOffer,
  respondToShareSuggestion,
  getReconcilerStatus,
  generateReconcilerSummary,
} from '../services/reconciler';
import { successResponse, errorResponse } from '../utils/response';
import { notifyPartner } from '../services/realtime';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if user has access to the session
 */
async function checkSessionAccess(
  sessionId: string,
  userId: string
): Promise<{ session: { id: string; status: string } | null; error: string | null }> {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      relationship: {
        members: {
          some: { userId },
        },
      },
    },
    select: { id: true, status: true },
  });

  if (!session) {
    return { session: null, error: 'Session not found or access denied' };
  }

  return { session, error: null };
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Run reconciler analysis for a session
 * POST /sessions/:id/reconciler/run
 */
export async function runReconcilerHandler(
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
    const parseResult = runReconcilerRequestSchema.safeParse(req.body);
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

    const { forUserId } = parseResult.data;

    // Check session access
    const { session, error } = await checkSessionAccess(sessionId, user.id);
    if (error || !session) {
      errorResponse(res, 'NOT_FOUND', error || 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Run the reconciler
    const result = await runReconciler(sessionId, forUserId);

    // Build response
    const response: RunReconcilerResponse = {
      sessionId,
      aUnderstandingB: result.aUnderstandingB
        ? {
          guesserId: '', // Will be filled from DB
          guesserName: '',
          subjectId: '',
          subjectName: '',
          result: result.aUnderstandingB,
          shareOfferStatus: 'NOT_OFFERED',
          analyzedAt: new Date().toISOString(),
        }
        : null,
      bUnderstandingA: result.bUnderstandingA
        ? {
          guesserId: '',
          guesserName: '',
          subjectId: '',
          subjectName: '',
          result: result.bUnderstandingA,
          shareOfferStatus: 'NOT_OFFERED',
          analyzedAt: new Date().toISOString(),
        }
        : null,
      bothCompleted: result.bothCompleted,
      readyToProceed: result.readyToProceed,
      blockingReason: result.blockingReason,
    };

    successResponse(res, response);
  } catch (error) {
    console.error('[runReconcilerHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to run reconciler', 500);
  }
}

/**
 * Get reconciler status for a session
 * GET /sessions/:id/reconciler/status
 */
export async function getReconcilerStatusHandler(
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

    // Check session access
    const { session, error } = await checkSessionAccess(sessionId, user.id);
    if (error || !session) {
      errorResponse(res, 'NOT_FOUND', error || 'Session not found', 404);
      return;
    }

    // Get reconciler status
    const status = await getReconcilerStatus(sessionId);

    const response: ReconcilerStatusResponse = {
      sessionId,
      hasRun: status.hasRun,
      aUnderstandingB: status.aUnderstandingB
        ? {
          guesserId: '',
          guesserName: '',
          subjectId: '',
          subjectName: '',
          result: status.aUnderstandingB,
          shareOfferStatus: 'NOT_OFFERED',
          analyzedAt: new Date().toISOString(),
        }
        : null,
      bUnderstandingA: status.bUnderstandingA
        ? {
          guesserId: '',
          guesserName: '',
          subjectId: '',
          subjectName: '',
          result: status.bUnderstandingA,
          shareOfferStatus: 'NOT_OFFERED',
          analyzedAt: new Date().toISOString(),
        }
        : null,
      pendingShareOffers: status.pendingShareOffers,
      readyForStage3: status.readyForStage3,
    };

    successResponse(res, response);
  } catch (error) {
    console.error('[getReconcilerStatusHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get reconciler status', 500);
  }
}

/**
 * Get pending share offer for the current user
 * GET /sessions/:id/reconciler/share-offer
 */
export async function getShareOfferHandler(
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

    // Check session access
    const { session, error } = await checkSessionAccess(sessionId, user.id);
    if (error || !session) {
      errorResponse(res, 'NOT_FOUND', error || 'Session not found', 404);
      return;
    }

    // Check if there's a pending share offer for this user
    const shareOffer = await prisma.reconcilerShareOffer.findFirst({
      where: {
        userId: user.id,
        result: { sessionId },
        status: { in: ['OFFERED', 'PENDING'] },
      },
      include: {
        result: true,
      },
    }) as any;

    if (!shareOffer) {
      // Try to generate one for legacy reciprocal flow if applicable
      const offer = await generateShareOffer(sessionId, user.id);

      if (offer) {
        successResponse(res, {
          hasSuggestion: true,
          suggestion: {
            guesserName: 'Your partner',
            suggestedContent: offer.offerMessage,
            reason: offer.gapDescription || 'To help them understand better',
            canRefine: true,
          }
        });
        return;
      }

      successResponse(res, {
        hasSuggestion: false,
        suggestion: null,
      });
      return;
    }

    // Get partner name (the one who made the guess) from the result
    const guesserName = shareOffer.result.guesserName || 'Your partner';

    // If it was PENDING, mark as OFFERED now that it's being retrieved
    if (shareOffer.status === 'PENDING') {
      await prisma.reconcilerShareOffer.update({
        where: { id: shareOffer.id },
        data: { status: 'OFFERED' },
      });
      console.log(`[Reconciler] Marked share offer ${shareOffer.id} as OFFERED for user ${user.id}`);
    }

    successResponse(res, {
      hasSuggestion: true,
      suggestion: {
        guesserName,
        suggestedContent: shareOffer.suggestedContent || shareOffer.offerMessage || '',
        reason: shareOffer.suggestedReason || shareOffer.result.mostImportantGap || 'This will help them understand your perspective more fully.',
        canRefine: true,
      }
    });
  } catch (error) {
    console.error('[getShareOfferHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get share offer', 500);
  }
}

/**
 * Respond to a share offer
 * POST /sessions/:id/reconciler/share-offer/respond
 */
export async function respondToShareOfferHandler(
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
    const parseResult = respondToShareOfferRequestSchema.safeParse(req.body);
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

    // Check session access
    const { session, error } = await checkSessionAccess(sessionId, user.id);
    if (error || !session) {
      errorResponse(res, 'NOT_FOUND', error || 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Respond to the share offer
    let result;
    if (parseResult.data.action) {
      // Use new asymmetric reconciler service
      result = await respondToShareSuggestion(sessionId, user.id, {
        action: parseResult.data.action as 'accept' | 'decline' | 'refine',
        refinedContent: parseResult.data.refinedContent,
      });
    } else if (parseResult.data.accept !== undefined) {
      // Use legacy reciprocal reconciler service
      result = await respondToShareOffer(sessionId, user.id, {
        accept: parseResult.data.accept,
        selectedQuoteIndex: parseResult.data.selectedQuoteIndex,
        customContent: parseResult.data.customContent,
      });
    } else {
      errorResponse(res, 'VALIDATION_ERROR', 'Either "action" or "accept" must be provided', 400);
      return;
    }

    // Notify partner if content was shared
    if (result.status === 'ACCEPTED' || result.status === 'shared') {
      // Get partner ID
      const members = await prisma.relationshipMember.findMany({
        where: {
          relationship: {
            sessions: { some: { id: sessionId } },
          },
        },
        select: { userId: true },
      });

      const partnerId = members.find((m) => m.userId !== user.id)?.userId;

      if (partnerId) {
        // Use more specific event if it's from asymmetric flow
        const eventName = parseResult.data.action
          ? 'empathy.context_shared'
          : 'partner.additional_context_shared';

        await notifyPartner(sessionId, partnerId, eventName, {
          stage: 2,
          sharedBy: user.id,
          content: result.sharedContent,
        });
      }
    }

    const response: RespondToShareOfferResponse = {
      status: result.status as any,
      sharedContent: result.sharedContent,
      confirmationMessage: (result as any).confirmationMessage || 'Content shared successfully.',
      guesserUpdated: (result as any).guesserUpdated,
    };

    successResponse(res, response);
  } catch (error) {
    console.error('[respondToShareOfferHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to respond to share offer', 500);
  }
}

/**
 * Get reconciler summary after completion
 * GET /sessions/:id/reconciler/summary
 */
export async function getReconcilerSummaryHandler(
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

    // Check session access
    const { session, error } = await checkSessionAccess(sessionId, user.id);
    if (error || !session) {
      errorResponse(res, 'NOT_FOUND', error || 'Session not found', 404);
      return;
    }

    // Check if reconciler has completed
    const status = await getReconcilerStatus(sessionId);

    if (!status.hasRun) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Reconciler has not run yet',
        400
      );
      return;
    }

    if (!status.readyForStage3) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Reconciliation not yet complete - pending share offers',
        400
      );
      return;
    }

    // Generate summary
    const summary = await generateReconcilerSummary(sessionId);

    if (!summary) {
      errorResponse(
        res,
        'INTERNAL_ERROR',
        'Failed to generate reconciler summary',
        500
      );
      return;
    }

    successResponse(res, summary);
  } catch (error) {
    console.error('[getReconcilerSummaryHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get reconciler summary', 500);
  }
}

/**
 * Skip share offer (decline without explicit response)
 * POST /sessions/:id/reconciler/share-offer/skip
 */
export async function skipShareOfferHandler(
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

    // Check session access
    const { session, error } = await checkSessionAccess(sessionId, user.id);
    if (error || !session) {
      errorResponse(res, 'NOT_FOUND', error || 'Session not found', 404);
      return;
    }

    // Find and update the share offer
    const shareOffer = await prisma.reconcilerShareOffer.findFirst({
      where: {
        userId: user.id,
        result: { sessionId },
        status: 'OFFERED',
      },
    });

    if (!shareOffer) {
      errorResponse(res, 'NOT_FOUND', 'No pending share offer found', 404);
      return;
    }

    await prisma.reconcilerShareOffer.update({
      where: { id: shareOffer.id },
      data: {
        status: 'SKIPPED',
        skippedAt: new Date(),
      },
    });

    successResponse(res, {
      status: 'SKIPPED',
      message: 'Share offer skipped. You can proceed to the next stage.',
    });
  } catch (error) {
    console.error('[skipShareOfferHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to skip share offer', 500);
  }
}
