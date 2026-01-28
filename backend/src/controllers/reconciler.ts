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
  MessageRole,
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
import { routeModel, scoreAmbiguity } from '../services/model-router';
import { suggestSendableRewrite } from '../services/attacking-language';

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
            suggestedContent: offer.suggestedContent,
            reason: offer.suggestedReason || offer.gapDescription || 'To help them understand better',
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
        // For the new two-phase flow: suggestedShareFocus is the topic (shown first)
        suggestedShareFocus: shareOffer.result.suggestedShareFocus || null,
        // suggestedContent is the AI-crafted, feelings-focused suggestion
        suggestedContent: shareOffer.suggestedContent || shareOffer.offerMessage || '',
        reason: shareOffer.suggestedReason || shareOffer.result.mostImportantGap || 'This will help them understand your perspective more fully.',
        canRefine: true,
        // Action determines styling: OFFER_SHARING (strong language) vs OFFER_OPTIONAL (soft language)
        action: shareOffer.result.recommendedAction as 'PROCEED' | 'OFFER_OPTIONAL' | 'OFFER_SHARING',
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

        // Include full empathy status to avoid extra HTTP round-trip
        const { buildEmpathyExchangeStatus } = await import('../services/empathy-status');
        const partnerEmpathyStatus = await buildEmpathyExchangeStatus(sessionId, partnerId);

        await notifyPartner(sessionId, partnerId, eventName, {
          stage: 2,
          sharedBy: user.id,
          content: result.sharedContent,
          // Include forUserId so mobile can filter - only the guesser should see the modal
          forUserId: partnerId,
          empathyStatus: partnerEmpathyStatus,
          // Include triggeredByUserId so frontend can filter out events triggered by self
          triggeredByUserId: user.id,
        }, { excludeUserId: user.id }); // Exclude actor to prevent race conditions
      }
    }

    const response: RespondToShareOfferResponse = {
      status: result.status as any,
      sharedContent: result.sharedContent,
      confirmationMessage: (result as any).confirmationMessage || 'Content shared successfully.',
      guesserUpdated: (result as any).guesserUpdated,
      sharedMessage: (result as any).sharedMessage,
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

/**
 * Generate a share draft for the user based on suggestedShareFocus.
 * This is called when the user taps "Yes, help me share" in the ShareTopicDrawer.
 * POST /sessions/:id/reconciler/share-offer/generate-draft
 *
 * The draft is generated and saved as a message so it persists.
 * The response includes the draft and metadata for the UI to show the "Review and share" button.
 */
export async function generateShareDraftHandler(
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

    // Find the share offer with reconciler result
    const shareOffer = await prisma.reconcilerShareOffer.findFirst({
      where: {
        userId: user.id,
        result: { sessionId },
        status: { in: ['OFFERED', 'PENDING'] },
      },
      include: {
        result: true,
      },
    });

    if (!shareOffer) {
      errorResponse(res, 'NOT_FOUND', 'No pending share offer found', 404);
      return;
    }

    const suggestedShareFocus = shareOffer.result.suggestedShareFocus;
    const guesserName = shareOffer.result.guesserName;

    if (!suggestedShareFocus) {
      errorResponse(res, 'VALIDATION_ERROR', 'No share focus available', 400);
      return;
    }

    // Get the full conversation history for this user (all stages, both user and AI)
    // This gives the AI proper context about what the user has already shared
    const conversationMessages = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          // Messages user sent (broadcast)
          { senderId: user.id, forUserId: null },
          // Messages specifically for this user (AI responses)
          { forUserId: user.id },
        ],
      },
      orderBy: { timestamp: 'asc' },
      take: 30, // Limit to recent context
      select: { content: true, role: true },
    });

    // Format as conversation transcript
    const conversationTranscript = conversationMessages
      .map((m) => `${m.role === 'USER' ? user.name : 'AI'}: ${m.content}`)
      .join('\n\n');

    // Generate the draft using AI
    const { getModelCompletion, BrainActivityCallType } = await import('../lib/bedrock');
    const turnId = `${sessionId}-share-draft-${Date.now()}`;

    const routingDecision = routeModel({
      requestType: 'draft',
      conflictIntensity: 4,
      ambiguityScore: scoreAmbiguity(suggestedShareFocus),
      messageLength: suggestedShareFocus.length,
    });

    const prompt = `You are helping ${user.name} prepare something to share with ${guesserName} to help them understand ${user.name}'s perspective better.

The reconciler identified this topic as important for ${guesserName} to understand:
"${suggestedShareFocus}"

Conversation history (${user.name}'s messages and AI responses):
---
${conversationTranscript || 'No previous conversation available.'}
---

Generate a brief, personal message (1-3 sentences) that ${user.name} could share with ${guesserName} about the topic above. The message should:
1. Be written in first person as if ${user.name} is speaking directly to ${guesserName}
2. Draw from what ${user.name} actually shared in the conversation above (don't invent new content)
3. Address the specific topic mentioned
4. Feel natural and genuine, not forced

Respond with ONLY the message text, no additional formatting or explanation.`;

    const draftContent = await getModelCompletion(routingDecision.model, {
      systemPrompt: prompt,
      messages: [{ role: 'user', content: 'Generate the share message.' }],
      maxTokens: 512,
      sessionId,
      turnId,
      operation: `share-draft-generation-${routingDecision.model}`,
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
    });

    if (!draftContent) {
      errorResponse(res, 'INTERNAL_ERROR', 'Failed to generate draft', 500);
      return;
    }

    const rewriteResult = await suggestSendableRewrite({
      text: draftContent.trim(),
      sessionId,
      turnId,
      requesterName: user.name || 'User',
      targetName: guesserName || 'partner',
    });

    // Update the share offer with the generated draft
    await prisma.reconcilerShareOffer.update({
      where: { id: shareOffer.id },
      data: {
        suggestedContent: draftContent.trim(),
      },
    });

    // Create an AI message with the draft so it persists in chat
    // The message content includes a marker that the mobile can parse to show the button
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null, // AI message
        forUserId: user.id,
        role: 'AI',
        content: `Here's what you could share with ${guesserName}:\n\n"${draftContent.trim()}"`,
        stage: 2,
      },
    });

    // Publish via Ably so UI updates immediately
    // The metadata will be included in the Ably message for the mobile to detect
    const { publishMessageAIResponse } = await import('../services/realtime');
    await publishMessageAIResponse(
      sessionId,
      user.id,
      {
        id: aiMessage.id,
        sessionId,
        senderId: null,
        content: aiMessage.content,
        timestamp: aiMessage.timestamp.toISOString(),
        role: MessageRole.AI,
        stage: aiMessage.stage,
      },
      {
        // Standard metadata fields that the realtime handler expects
        // The mobile will detect this is a share draft via the response payload
      }
    );

    successResponse(res, {
      success: true,
      draft: draftContent.trim(),
      messageId: aiMessage.id,
      guesserName,
      suggestedShareFocus,
      rewriteSuggestions: rewriteResult?.needsRewrite ? rewriteResult.variants : [],
      rewriteNote: rewriteResult?.needsRewrite ? rewriteResult.note : null,
    });
  } catch (error) {
    console.error('[generateShareDraftHandler] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to generate share draft', 500);
  }
}
