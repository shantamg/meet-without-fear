/**
 * Empathy Status Service
 *
 * Builds the EmpathyExchangeStatusResponse for a user in a session.
 * This is extracted into a service so it can be called from both:
 * - HTTP handlers (GET /sessions/:id/empathy/status)
 * - Ably event publishers (to send full data with events)
 */

import { prisma } from '../lib/prisma';
import type { EmpathyExchangeStatusResponse, SharedContentDeliveryStatus } from '@meet-without-fear/shared';
import {
  hasPartnerCompletedStage1,
  getSharedContextForGuesser,
  getSharedContentDeliveryStatus,
} from './reconciler';

/**
 * Build the full EmpathyExchangeStatusResponse for a user.
 * This is the same logic used by the HTTP endpoint, extracted for reuse.
 *
 * @param sessionId - The session ID
 * @param userId - The user ID to build the status for
 * @returns The empathy exchange status response
 */
export async function buildEmpathyExchangeStatus(
  sessionId: string,
  userId: string
): Promise<EmpathyExchangeStatusResponse> {
  // Get session and partner ID
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      relationship: {
        members: {
          some: { userId },
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
    throw new Error(`Session ${sessionId} not found or user ${userId} not a member`);
  }

  const partnerId = session.relationship.members.find(m => m.userId !== userId)?.userId ?? null;

  // Get both empathy attempts
  const [myAttempt, partnerAttempt] = await Promise.all([
    prisma.empathyAttempt.findFirst({
      where: { sessionId, sourceUserId: userId },
    }),
    prisma.empathyAttempt.findFirst({
      where: { sessionId, sourceUserId: partnerId ?? undefined },
    }),
  ]);

  // Check if MY attempt is being analyzed (not partner's)
  const analyzing = myAttempt?.status === 'ANALYZING';

  // Get refinement hint if my attempt needs work
  let refinementHint = null;
  if (myAttempt?.status === 'NEEDS_WORK') {
    const reconcilerResult = await prisma.reconcilerResult.findFirst({
      where: {
        sessionId,
        guesserId: userId,
        supersededAt: null,
      },
      select: {
        areaHint: true,
        guidanceType: true,
        promptSeed: true,
      },
    });

    if (reconcilerResult) {
      refinementHint = {
        areaHint: reconcilerResult.areaHint,
        guidanceType: reconcilerResult.guidanceType,
        promptSeed: reconcilerResult.promptSeed,
      };
    }
  }

  // Check if ready for Stage 3
  const readyForStage3 =
    myAttempt?.status === 'VALIDATED' && partnerAttempt?.status === 'VALIDATED';

  // Check if partner has completed Stage 1 (for triggering reconciler)
  let partnerStage1Completed = false;
  if (partnerId) {
    partnerStage1Completed = await hasPartnerCompletedStage1(sessionId, partnerId);
  }

  // Check if user is awaiting sharing (subject waiting to respond to share suggestion)
  const awaitingSharing = myAttempt?.status === 'AWAITING_SHARING';

  // Check if user has new shared context (guesser should refine)
  const hasNewSharedContext = myAttempt?.status === 'REFINING';

  // Fetch shared context if it exists
  let sharedContext: { content: string; sharedAt: string } | null = null;
  let messageCountSinceSharedContext = 0;
  const contextResult = await getSharedContextForGuesser(sessionId, userId);
  if (contextResult.hasSharedContext && contextResult.content && contextResult.sharedAt) {
    sharedContext = {
      content: contextResult.content,
      sharedAt: contextResult.sharedAt,
    };

    // Count user messages sent after the shared context was received
    const sharedAtDate = new Date(contextResult.sharedAt);
    const messagesAfterContext = await prisma.message.count({
      where: {
        sessionId,
        senderId: userId,
        role: 'USER',
        timestamp: { gt: sharedAtDate },
      },
    });
    messageCountSinceSharedContext = messagesAfterContext;
  }

  // Get delivery status and content of any shared content (for subject)
  const deliveryStatusResult = await getSharedContentDeliveryStatus(sessionId, userId);
  const sharedContentDeliveryStatus = deliveryStatusResult.hasSharedContent
    ? deliveryStatusResult.deliveryStatus
    : null;
  const mySharedContext = deliveryStatusResult.hasSharedContent && deliveryStatusResult.sharedContent
    ? {
      content: deliveryStatusResult.sharedContent,
      sharedAt: deliveryStatusResult.sharedAt!,
      deliveryStatus: deliveryStatusResult.deliveryStatus,
    }
    : null;

  // Get reconciler result for my empathy attempt
  let myReconcilerResult: {
    gapSeverity: 'none' | 'minor' | 'moderate' | 'significant';
    action: 'PROCEED' | 'OFFER_OPTIONAL' | 'OFFER_SHARING';
    analyzedAt: string;
    gapSummary: string | null;
  } | null = null;
  if (myAttempt) {
    const reconcilerResultForMe = await prisma.reconcilerResult.findFirst({
      where: {
        sessionId,
        guesserId: userId,
        supersededAt: null,
      },
      select: {
        gapSeverity: true,
        recommendedAction: true,
        createdAt: true,
        gapSummary: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reconcilerResultForMe) {
      myReconcilerResult = {
        gapSeverity: reconcilerResultForMe.gapSeverity as 'none' | 'minor' | 'moderate' | 'significant',
        action: reconcilerResultForMe.recommendedAction as 'PROCEED' | 'OFFER_OPTIONAL' | 'OFFER_SHARING',
        analyzedAt: reconcilerResultForMe.createdAt.toISOString(),
        gapSummary: reconcilerResultForMe.gapSummary,
      };
    }
  }

  // Derive delivery status from empathy attempt status
  const getEmpathyDeliveryStatus = (status: string): 'pending' | 'delivered' | 'seen' => {
    if (status === 'VALIDATED') return 'seen';
    if (status === 'REVEALED') return 'delivered';
    return 'pending';
  };

  // Check if guesser has unviewed shared context (should view Share tab before continuing)
  // True when status is REFINING, shared context exists, and user hasn't viewed the share tab
  // since the context was delivered
  let hasUnviewedSharedContext = false;
  if (hasNewSharedContext && sharedContext !== null) {
    const vessel = await prisma.userVessel.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
      select: { lastViewedShareTabAt: true },
    });
    const sharedAtDate = new Date(sharedContext.sharedAt);
    hasUnviewedSharedContext = !vessel?.lastViewedShareTabAt || vessel.lastViewedShareTabAt < sharedAtDate;
  }

  return {
    myAttempt: myAttempt
      ? {
        id: myAttempt.id,
        sourceUserId: myAttempt.sourceUserId ?? '',
        content: myAttempt.content,
        sharedAt: myAttempt.sharedAt.toISOString(),
        consentRecordId: myAttempt.consentRecordId ?? '',
        status: myAttempt.status,
        revealedAt: myAttempt.revealedAt?.toISOString() ?? null,
        revisionCount: myAttempt.revisionCount,
        deliveryStatus: getEmpathyDeliveryStatus(myAttempt.status),
      }
      : null,
    partnerAttempt: partnerAttempt &&
      (partnerAttempt.status === 'REVEALED' || partnerAttempt.status === 'VALIDATED')
      ? {
        id: partnerAttempt.id,
        sourceUserId: partnerAttempt.sourceUserId ?? '',
        content: partnerAttempt.content,
        sharedAt: partnerAttempt.sharedAt.toISOString(),
        consentRecordId: partnerAttempt.consentRecordId ?? '',
        status: partnerAttempt.status,
        revealedAt: partnerAttempt.revealedAt?.toISOString() ?? null,
        revisionCount: partnerAttempt.revisionCount,
      }
      : null,
    partnerCompletedStage1: partnerStage1Completed,
    analyzing,
    awaitingSharing,
    hasNewSharedContext,
    hasUnviewedSharedContext,
    sharedContext,
    refinementHint,
    readyForStage3,
    messageCountSinceSharedContext,
    sharedContentDeliveryStatus: sharedContentDeliveryStatus as SharedContentDeliveryStatus | null,
    mySharedContext,
    mySharedAt: mySharedContext?.sharedAt ?? null,
    myReconcilerResult,
    partnerHasSubmittedEmpathy: !!partnerAttempt,
    partnerEmpathyHeldStatus: partnerAttempt?.status ?? null,
    partnerEmpathySubmittedAt: partnerAttempt?.sharedAt?.toISOString() ?? null,
  };
}

/**
 * Build empathy status for both users in a session.
 * Useful when you need to send updates to both users.
 *
 * @param sessionId - The session ID
 * @returns Object with status for each user
 */
export async function buildEmpathyExchangeStatusForBothUsers(
  sessionId: string
): Promise<{ [userId: string]: EmpathyExchangeStatusResponse }> {
  // Get session members
  const session = await prisma.session.findFirst({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const userIds = session.relationship.members.map(m => m.userId);
  const result: { [userId: string]: EmpathyExchangeStatusResponse } = {};

  for (const userId of userIds) {
    result[userId] = await buildEmpathyExchangeStatus(sessionId, userId);
  }

  return result;
}
