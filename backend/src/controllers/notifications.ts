/**
 * Notifications Controller
 *
 * Provides pending action items and badge counts for the activity menu.
 * - GET /sessions/:id/pending-actions - Get pending actions for a session
 * - GET /notifications/badge-count - Get aggregate badge count across sessions
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { successResponse, errorResponse } from '../utils/response';

// ============================================================================
// Types
// ============================================================================

interface PendingAction {
  type: 'share_offer' | 'validate_empathy' | 'context_received';
  id: string;
  data: Record<string, unknown>;
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Get pending actions for a session
 * GET /sessions/:id/pending-actions
 *
 * Returns action items the user needs to attend to:
 * - Share offers (PENDING/OFFERED from reconciler)
 * - Empathy validation (partner's revealed empathy needing feedback)
 * - Received shared context (unread)
 */
export async function getPendingActionsHandler(
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

    // Verify session access
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

    const actions: PendingAction[] = [];

    // 1. Pending share offers (reconciler suggested sharing)
    const shareOffers = await prisma.reconcilerShareOffer.findMany({
      where: {
        userId: user.id,
        result: { sessionId },
        status: { in: ['PENDING', 'OFFERED'] },
      },
      include: { result: true },
    });

    for (const offer of shareOffers) {
      actions.push({
        type: 'share_offer',
        id: offer.id,
        data: {
          guesserName: offer.result.guesserName,
          suggestedContent: offer.suggestedContent,
          suggestedShareFocus: offer.result.suggestedShareFocus,
          action: offer.result.recommendedAction,
        },
      });
    }

    // 2. Partner empathy needing validation (REVEALED, no validation from this user)
    const partnerAttempts = await prisma.empathyAttempt.findMany({
      where: {
        sessionId,
        sourceUserId: { not: user.id },
        status: 'REVEALED',
      },
      include: {
        validations: {
          where: { userId: user.id },
        },
      },
    });

    for (const attempt of partnerAttempts) {
      if (attempt.validations.length === 0) {
        actions.push({
          type: 'validate_empathy',
          id: attempt.id,
          data: {
            content: attempt.content,
            sourceUserId: attempt.sourceUserId,
          },
        });
      }
    }

    // 3. Unread shared context (SHARED_CONTEXT messages for this user)
    const vessel = await prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId: user.id, sessionId } },
      select: { lastViewedShareTabAt: true },
    });

    const unreadContext = await prisma.message.findMany({
      where: {
        sessionId,
        forUserId: user.id,
        senderId: { not: user.id },
        role: 'SHARED_CONTEXT',
        ...(vessel?.lastViewedShareTabAt
          ? { timestamp: { gt: vessel.lastViewedShareTabAt } }
          : {}),
      },
      orderBy: { timestamp: 'desc' },
    });

    for (const msg of unreadContext) {
      actions.push({
        type: 'context_received',
        id: msg.id,
        data: {
          content: msg.content,
          senderId: msg.senderId,
          timestamp: msg.timestamp.toISOString(),
        },
      });
    }

    // 4. Count sent tab updates (delivery/seen status changes the user hasn't been notified about)
    const sentTabUpdates = await prisma.reconcilerShareOffer.count({
      where: {
        userId: user.id, // items I sent (I am the subject)
        result: { sessionId },
        status: 'ACCEPTED',
        OR: [
          { deliveryStatus: 'DELIVERED', lastDeliveryNotifiedAt: null },
          { deliveryStatus: 'SEEN', lastSeenNotifiedAt: null },
        ],
      },
    });

    successResponse(res, { actions, sentTabUpdates });
  } catch (error) {
    console.error('[getPendingActionsHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get pending actions', 500);
  }
}

/**
 * Get badge count across all active sessions
 * GET /notifications/badge-count
 *
 * Aggregates pending action counts for the app-level badge.
 */
export async function getBadgeCountHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    // Get all active sessions for this user
    const sessions = await prisma.session.findMany({
      where: {
        status: { in: ['ACTIVE', 'INVITED'] },
        relationship: {
          members: { some: { userId: user.id } },
        },
      },
      select: { id: true },
    });

    const bySession: Record<string, number> = {};
    let total = 0;

    for (const session of sessions) {
      let count = 0;

      // Share offers
      const shareOfferCount = await prisma.reconcilerShareOffer.count({
        where: {
          userId: user.id,
          result: { sessionId: session.id },
          status: { in: ['PENDING', 'OFFERED'] },
        },
      });
      count += shareOfferCount;

      // Unvalidated partner empathy
      const unvalidatedCount = await prisma.empathyAttempt.count({
        where: {
          sessionId: session.id,
          sourceUserId: { not: user.id },
          status: 'REVEALED',
          validations: { none: { userId: user.id } },
        },
      });
      count += unvalidatedCount;

      // Unread shared context messages (from partner, not self-sent)
      const vessel = await prisma.userVessel.findUnique({
        where: { userId_sessionId: { userId: user.id, sessionId: session.id } },
        select: { lastViewedShareTabAt: true },
      });

      const unreadContextCount = await prisma.message.count({
        where: {
          sessionId: session.id,
          forUserId: user.id,
          senderId: { not: user.id },
          role: 'SHARED_CONTEXT',
          ...(vessel?.lastViewedShareTabAt
            ? { timestamp: { gt: vessel.lastViewedShareTabAt } }
            : {}),
        },
      });
      count += unreadContextCount;

      if (count > 0) {
        bySession[session.id] = count;
        total += count;
      }
    }

    successResponse(res, { count: total, bySession });
  } catch (error) {
    console.error('[getBadgeCountHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get badge count', 500);
  }
}
