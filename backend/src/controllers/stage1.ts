/**
 * Stage 1 Controller
 *
 * Handles the Witness stage endpoints:
 * - POST /sessions/:id/messages - Send message and get AI response
 * - POST /sessions/:id/feel-heard - Confirm user feels heard
 * - GET /sessions/:id/messages - Get conversation history
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getOrchestratedResponse, type FullAIContext } from '../services/ai';
import { getSonnetResponse } from '../lib/bedrock';
import { buildInitialMessagePrompt, buildStagePrompt } from '../services/stage-prompts';
import { extractJsonFromResponse } from '../utils/json-extractor';
import {
  sendMessageRequestSchema,
  feelHeardRequestSchema,
  getMessagesQuerySchema,
  ApiResponse,
  ErrorCode,
} from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId, isSessionCreator } from '../utils/session';
import { embedMessage } from '../services/embedding';
import { updateSessionSummary } from '../services/conversation-summarizer';
import { auditLog } from '../services/audit-logger';
import { runReconcilerForDirection } from '../services/reconciler';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if partner has completed stage 1 "feel heard"
 */
async function hasPartnerCompletedStage1(
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
        stage: 1,
      },
    },
  });

  if (!partnerProgress) return false;

  const gates = partnerProgress.gatesSatisfied as Record<string, unknown> | null;
  return gates?.feelHeard === true;
}

/**
 * Get a fallback initial message when AI is unavailable
 */
function getFallbackInitialMessage(
  userName: string,
  partnerName: string | undefined,
  isInvitationPhase: boolean,
  isInvitee: boolean
): string {
  const partner = partnerName || 'them';

  if (isInvitee) {
    return `Hey ${userName}, thanks for accepting ${partner}'s invitation to talk. What's been on your mind about things with ${partner}?`;
  }

  if (isInvitationPhase) {
    return `Hey ${userName}, what's going on with ${partner}?`;
  }

  return `Hey ${userName}, what's on your mind?`;
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Send a message in Stage 1 and get AI witness response
 * POST /sessions/:id/messages
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  const requestStartTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`[sendMessage:${requestId}] ========== REQUEST START ==========`);
    console.log(`[sendMessage:${requestId}] Timestamp: ${new Date().toISOString()}`);

    const user = req.user;
    if (!user) {
      console.log(`[sendMessage:${requestId}] ERROR: No user in request`);
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    console.log(`[sendMessage:${requestId}] Session ID: ${sessionId}`);
    console.log(`[sendMessage:${requestId}] User ID: ${user.id}`);


    // Validate request body
    const parseResult = sendMessageRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.log(`[sendMessage:${requestId}] Validation failed:`, JSON.stringify(parseResult.error.issues, null, 2));
      console.log(`[sendMessage:${requestId}] Request body:`, JSON.stringify(req.body, null, 2));
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { content } = parseResult.data;
    console.log(`[sendMessage:${requestId}] Message content length: ${content.length}`);
    console.log(`[sendMessage:${requestId}] Message content preview: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
    const lowerContent = content.toLowerCase();

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

    // Check session allows messaging
    // ACTIVE: All members can send messages
    // CREATED: Only creator can send messages (crafting invitation message)
    // INVITED: All members can send messages (creator and invitee who accepted)
    if (session.status !== 'ACTIVE') {
      if (session.status === 'CREATED') {
        // CREATED: Only creator can send messages while crafting invitation
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          console.log(`[sendMessage] Session ${sessionId} is ${session.status} and user ${user.id} is not the creator`);
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }
      } else if (session.status === 'INVITED') {
        // INVITED: All members can send messages (user is already verified as a member above)
        // This allows both creator and invitee to message after invitation is sent/accepted
      } else {
        console.log(`[sendMessage] Session ${sessionId} is not active: ${session.status}`);
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
    }

    // Get user's current stage progress
    // Include both IN_PROGRESS and GATE_PENDING statuses since users can still message
    // while waiting for partner to complete a gate (e.g., after confirming feel-heard)
    let progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: { in: ['IN_PROGRESS', 'GATE_PENDING'] },
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 1, auto-advance from Stage 0 if compact is signed
    let currentStage = progress?.stage ?? 0;
    if (currentStage === 0) {
      // During CREATED status (invitation crafting), allow messages at Stage 0
      if (session.status === 'CREATED') {
        console.log(`[sendMessage] Allowing Stage 0 message during invitation crafting phase`);
        // Stay at Stage 0, allow message
      } else {
        // Check if compact is signed - if so, auto-advance to Stage 1
        const gates = progress?.gatesSatisfied as Record<string, unknown> | null;
        if (gates?.compactSigned) {
          console.log(`[sendMessage] Auto-advancing user ${user.id} from Stage 0 to Stage 1`);
          const now = new Date();

          // Complete Stage 0
          if (progress) {
            await prisma.stageProgress.update({
              where: { id: progress.id },
              data: { status: 'COMPLETED', completedAt: now },
            });
          }

          // Create Stage 1 progress
          progress = await prisma.stageProgress.create({
            data: {
              sessionId,
              userId: user.id,
              stage: 1,
              status: 'IN_PROGRESS',
              startedAt: now,
              gatesSatisfied: {},
            },
          });
          currentStage = 1;
        } else {
          // Compact not signed yet - allow onboarding chat
          // The onboarding prompt will help them understand the process
          console.log(`[sendMessage] Allowing onboarding chat for user ${user.id} in Stage 0 (compact not signed)`);
          // Stay at Stage 0, allow message with onboarding flag
        }
      }
    } else if (currentStage < 0 || currentStage > 4) {
      // Chat is available in stages 0-4 (Stage 0 for onboarding, Stages 1-4 for main flow)
      console.log(`[sendMessage] User ${user.id} in session ${sessionId} is in stage ${currentStage}, outside valid range 0-4`);
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot send messages: you are in stage ${currentStage}, but chat requires stages 1-4`,
        400
      );
      return;
    }

    // Save user message
    console.log(`[sendMessage:${requestId}] Creating user message in database...`);
    const userMessageStartTime = Date.now();
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: user.id,
        role: 'USER',
        content,
        stage: currentStage,
      },
    });
    console.log(`[sendMessage:${requestId}] ✅ User message created: ID=${userMessage.id}, timestamp=${userMessage.timestamp.toISOString()}, stage=${userMessage.stage}`);
    console.log(`[sendMessage:${requestId}] User message creation took ${Date.now() - userMessageStartTime}ms`);

    // Check for duplicate user messages (same content, same user, within last 5 seconds)
    const recentDuplicates = await prisma.message.findMany({
      where: {
        sessionId,
        senderId: user.id,
        role: 'USER',
        content: content,
        id: { not: userMessage.id },
        timestamp: {
          gte: new Date(Date.now() - 5000), // Last 5 seconds
        },
      },
    });
    if (recentDuplicates.length > 0) {
      console.warn(`[sendMessage:${requestId}] ⚠️  WARNING: Found ${recentDuplicates.length} duplicate user message(s) in last 5 seconds!`);
      recentDuplicates.forEach((dup, idx) => {
        console.warn(`[sendMessage:${requestId}]   Duplicate ${idx + 1}: ID=${dup.id}, timestamp=${dup.timestamp.toISOString()}`);
      });
    }

    // NOTE: User message embedding moved below after turnId is generated

    // Get conversation history for context (only this user's messages and AI responses to them)
    console.log(`[sendMessage:${requestId}] Fetching conversation history...`);
    const historyStartTime = Date.now();
    // IMPORTANT: We need the MOST RECENT messages for context.
    // If we order ASC and take N, Prisma returns the OLDEST N messages, which means once a session
    // has more than N messages, the "lastMessage" passed to the orchestrator will be stale and the
    // AI can appear to repeat the same response forever.
    //
    // So we fetch newest-first and then reverse to preserve chronological order for the model.
    const historyDesc = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { senderId: user.id },
          { role: 'AI', forUserId: user.id },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: 20, // Limit context window (newest 20)
    });
    const history = historyDesc.slice().reverse();
    console.log(`[sendMessage:${requestId}] ✅ History fetched: ${history.length} messages (took ${Date.now() - historyStartTime}ms)`);
    console.log(`[sendMessage:${requestId}] History breakdown: ${history.filter(m => m.role === 'USER').length} user, ${history.filter(m => m.role === 'AI').length} AI`);

    // Log recent message IDs to detect duplicates
    const recentMessages = history.slice(-5);
    console.log(`[sendMessage:${requestId}] Recent 5 message IDs:`, recentMessages.map(m => `${m.role}:${m.id.substring(0, 8)}...`).join(', '));

    // Count user turns for AI context
    const userTurnCount = history.filter((m) => m.role === 'USER').length;
    console.log(`[sendMessage:${requestId}] User turn count: ${userTurnCount}`);

    // Generate turnId for this user action - used to group all costs from this message
    const turnId = `${sessionId}-${userTurnCount}`;

    // Detect stage transition: check if this is the first message in Stage 1
    // A stage transition happens when:
    // 1. There are previous messages in the session (from Stage 0 invitation phase)
    // 2. This is the first Stage 1 message from this user (excluding the just-saved message)
    const previousStage1Messages = history.filter(
      (m) => m.stage === 1 && m.senderId === user.id && m.id !== userMessage.id
    );
    // history includes the just-saved message, so we check if there are OTHER Stage 1 messages
    const hasStage0Messages = history.some((m) => m.stage === 0);
    const isStageTransition = hasStage0Messages && previousStage1Messages.length === 0;

    // If it's a stage transition, determine the previous stage
    let previousStage: number | undefined;
    if (isStageTransition) {
      const previousStages = history
        .filter((m) => m.stage !== currentStage)
        .map((m) => m.stage);
      if (previousStages.length > 0) {
        previousStage = Math.max(...previousStages);
      }
      console.log(
        `[sendMessage] Stage transition detected: ${previousStage ?? 'unknown'} → ${currentStage}`
      );
    }

    // Get partner name for context
    const partnerId = await getPartnerUserId(sessionId, user.id);
    let partnerName: string | undefined;
    if (partnerId) {
      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { name: true },
      });
      partnerName = partner?.name || undefined;
    } else if (session.status === 'CREATED') {
      // During invitation phase, get partner name from the invitation
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { name: true },
      });
      partnerName = invitation?.name || undefined;
    }

    // Get session for duration calculation
    const sessionForDuration = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    const sessionDurationMinutes = sessionForDuration
      ? Math.floor((Date.now() - sessionForDuration.createdAt.getTime()) / 60000)
      : 0;

    // Determine if this is the first turn in the session
    const isFirstTurnInSession = userTurnCount === 1;

    // Check if we're in the invitation crafting phase (session status is CREATED)
    const isInvitationPhase = session.status === 'CREATED';

    // Check if we're in onboarding mode (Stage 0 with compact not signed)
    // This happens when the user is viewing the Curiosity Compact and may have questions
    const myGates = progress?.gatesSatisfied as Record<string, unknown> | null;
    const isOnboarding = currentStage === 0 && !isInvitationPhase && !myGates?.compactSigned;

    // Check if user is trying to refine their invitation (session is INVITED and they ask to refine)
    const isRefiningInvitation =
      session.status === 'INVITED' &&
      lowerContent.includes('refine') &&
      lowerContent.includes('invitation');

    // Fetch current invitation message for refinement context
    let currentInvitationMessage: string | null = null;
    if (isRefiningInvitation || isInvitationPhase) {
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { invitationMessage: true, name: true },
      });
      currentInvitationMessage = invitation?.invitationMessage || null;
      // Also get partner name from invitation if not already set
      if (!partnerName && invitation?.name) {
        partnerName = invitation.name;
      }
    }

    // Fetch current empathy draft for refinement context (Stage 2)
    let currentEmpathyDraft: string | null = null;
    let isRefiningEmpathy = false;
    if (currentStage === 2) {
      const draft = await prisma.empathyDraft.findUnique({
        where: {
          sessionId_userId: {
            sessionId,
            userId: user.id,
          },
        },
        select: { content: true },
      });

      currentEmpathyDraft = draft?.content || null;

      const refinementKeywords = ['refine empathy draft', 'refine', 'edit', 'change', 'update', 'tweak', 'adjust', 'revise', 'direct', 'tone', 'shorter', 'longer'];
      isRefiningEmpathy =
        refinementKeywords.some((keyword) => lowerContent.includes(keyword)) ||
        lowerContent.includes('add more') ||
        lowerContent.includes('make it shorter') ||
        lowerContent.includes('make it longer');
    }

    // Build full context for orchestrated response
    const aiContext: FullAIContext = {
      sessionId,
      userId: user.id,
      turnId,
      userName: user.name || 'there',
      partnerName,
      stage: currentStage,
      turnCount: userTurnCount,
      emotionalIntensity: 5, // TODO: Get from emotional barometer when implemented
      sessionDurationMinutes,
      isFirstTurnInSession,
      isInvitationPhase: isInvitationPhase || isRefiningInvitation,
      isRefiningInvitation,
      isStageTransition,
      previousStage,
      currentInvitationMessage,
      currentEmpathyDraft,
      isRefiningEmpathy,
      isOnboarding, // Stage 0 with compact not signed - use onboarding prompt
    };

    // Get AI response using full orchestration pipeline
    console.log(`[sendMessage:${requestId}] Calling orchestrator with ${history.length} messages...`);
    const orchestratorStartTime = Date.now();
    const orchestratorResult = await getOrchestratedResponse(
      history.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      aiContext
    );
    const orchestratorTime = Date.now() - orchestratorStartTime;
    console.log(`[sendMessage:${requestId}] ✅ Orchestrator completed in ${orchestratorTime}ms`);
    console.log(
      `[sendMessage:${requestId}] Orchestrator result: intent=${orchestratorResult.memoryIntent.intent}, depth=${orchestratorResult.memoryIntent.depth}, mock=${orchestratorResult.usedMock}`
    );
    console.log(`[sendMessage:${requestId}] AI response length: ${orchestratorResult.response.length}`);
    console.log(`[sendMessage:${requestId}] AI response preview: "${orchestratorResult.response.substring(0, 150)}${orchestratorResult.response.length > 150 ? '...' : ''}"`);

    // Debug: Log feel-heard check recommendation from AI (Stage 1)
    if (currentStage === 1) {
      console.log(
        `[sendMessage] Stage 1 feel-heard check: offerFeelHeardCheck=${orchestratorResult.offerFeelHeardCheck}, turnCount=${userTurnCount}`
      );
    }

    // Stage 1: If AI recommends feel-heard check, persist to stage progress
    // This allows mobile to restore the state on remount
    if (currentStage === 1 && orchestratorResult.offerFeelHeardCheck && progress) {
      try {
        const currentGates = (progress.gatesSatisfied as Record<string, unknown>) ?? {};
        await prisma.stageProgress.update({
          where: { id: progress.id },
          data: {
            gatesSatisfied: {
              ...currentGates,
              feelHeardCheckOffered: true,
            },
          },
        });
        console.log(`[sendMessage] Stage 1: Persisted feelHeardCheckOffered=true for user ${user.id}`);
      } catch (err) {
        console.warn('[sendMessage] Failed to persist feelHeardCheckOffered:', err);
      }
    }

    // The orchestrator already parses structured JSON responses and extracts:
    // - response: the text to show in chat
    // - invitationMessage: the proposed invitation (if any)
    const aiResponseContent = orchestratorResult.response;
    const extractedInvitationMessage = orchestratorResult.invitationMessage ?? null;

    // Only save invitation message during invitation phase
    if ((isInvitationPhase || isRefiningInvitation) && extractedInvitationMessage) {
      console.log(`[sendMessage] Extracted invitation draft: "${extractedInvitationMessage}"`);

      // Save draft to invitation record
      // CRITICAL FIX: Mark as unconfirmed so it is treated as a draft
      await prisma.invitation.updateMany({
        where: { sessionId, invitedById: user.id },
        data: {
          invitationMessage: extractedInvitationMessage,
          messageConfirmed: false
        },
      });
    }

    // Stage 2: If AI is offering ready-to-share, auto-save the empathy draft
    // Save with readyToShare: false so user sees low-profile confirmation prompt first
    // User must explicitly confirm to see the full preview card
    if (
      currentStage === 2 &&
      orchestratorResult.offerReadyToShare &&
      orchestratorResult.proposedEmpathyStatement
    ) {
      try {
        await prisma.empathyDraft.upsert({
          where: {
            sessionId_userId: {
              sessionId,
              userId: user.id,
            },
          },
          create: {
            sessionId,
            userId: user.id,
            content: orchestratorResult.proposedEmpathyStatement,
            readyToShare: false, // User must confirm before seeing full preview
            version: 1,
          },
          update: {
            content: orchestratorResult.proposedEmpathyStatement,
            // Don't change readyToShare if draft already exists - user may have confirmed
            version: { increment: 1 },
          },
        });
        console.log(`[sendMessage] Stage 2: Auto-saved empathy draft for user ${user.id}`);
      } catch (err) {
        console.error('[sendMessage] Failed to auto-save empathy draft:', err);
      }
    }

    // Save AI response (just the conversational part)
    console.log(`[sendMessage:${requestId}] Creating AI message in database...`);
    const aiMessageStartTime = Date.now();
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: user.id, // Track which user this AI response is for (data isolation)
        role: 'AI',
        content: aiResponseContent,
        stage: currentStage,
      },
    });
    console.log(`[sendMessage:${requestId}] ✅ AI message created: ID=${aiMessage.id}, timestamp=${aiMessage.timestamp.toISOString()}, stage=${aiMessage.stage}`);
    console.log(`[sendMessage:${requestId}] AI message creation took ${Date.now() - aiMessageStartTime}ms`);

    // Check for duplicate AI messages (same content, same user, within last 5 seconds)
    const recentAIDuplicates = await prisma.message.findMany({
      where: {
        sessionId,
        role: 'AI',
        forUserId: user.id,
        content: aiResponseContent,
        id: { not: aiMessage.id },
        timestamp: {
          gte: new Date(Date.now() - 5000), // Last 5 seconds
        },
      },
    });
    if (recentAIDuplicates.length > 0) {
      console.warn(`[sendMessage:${requestId}] ⚠️  WARNING: Found ${recentAIDuplicates.length} duplicate AI message(s) in last 5 seconds!`);
      recentAIDuplicates.forEach((dup, idx) => {
        console.warn(`[sendMessage:${requestId}]   Duplicate ${idx + 1}: ID=${dup.id}, timestamp=${dup.timestamp.toISOString()}`);
      });
    }

    // Embed messages for cross-session retrieval (non-blocking)
    // Pass turnId so embedding cost is attributed to this user message
    embedMessage(userMessage.id, turnId).catch((err) =>
      console.warn(`[sendMessage:${requestId}] Failed to embed user message:`, err)
    );
    embedMessage(aiMessage.id, turnId).catch((err) =>
      console.warn(`[sendMessage:${requestId}] Failed to embed AI message:`, err)
    );

    // Summarize older parts of the conversation (non-blocking)
    // This creates/updates a rolling summary in UserVessel.conversationSummary once message count crosses thresholds.
    // Pass turnId so summarization cost is attributed to this user message
    updateSessionSummary(sessionId, user.id, turnId).catch((err) =>
      console.warn(`[sendMessage:${requestId}] Failed to update session summary:`, err)
    );

    const totalTime = Date.now() - requestStartTime;
    console.log(`[sendMessage:${requestId}] ========== REQUEST SUCCESS ==========`);
    console.log(`[sendMessage:${requestId}] Total request time: ${totalTime}ms`);
    console.log(`[sendMessage:${requestId}] Returning response with userMessage.id=${userMessage.id}, aiMessage.id=${aiMessage.id}`);

    successResponse(res, {
      userMessage: {
        id: userMessage.id,
        sessionId: userMessage.sessionId,
        senderId: userMessage.senderId,
        role: userMessage.role,
        content: userMessage.content,
        stage: userMessage.stage,
        timestamp: userMessage.timestamp.toISOString(),
      },
      aiResponse: {
        id: aiMessage.id,
        sessionId: aiMessage.sessionId,
        senderId: aiMessage.senderId,
        role: aiMessage.role,
        content: aiMessage.content,
        stage: aiMessage.stage,
        timestamp: aiMessage.timestamp.toISOString(),
      },
      // Include structured response fields from AI
      offerFeelHeardCheck: orchestratorResult.offerFeelHeardCheck,
      offerReadyToShare: orchestratorResult.offerReadyToShare,
      invitationMessage: extractedInvitationMessage,
      proposedEmpathyStatement: orchestratorResult.proposedEmpathyStatement ?? null,
    });
  } catch (error) {
    const totalTime = Date.now() - requestStartTime;
    console.error(`[sendMessage:${requestId}] ========== REQUEST ERROR ==========`);
    console.error(`[sendMessage:${requestId}] Error after ${totalTime}ms:`, error);
    if (error instanceof Error) {
      console.error(`[sendMessage:${requestId}] Error stack:`, error.stack);
    }
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to send message', 500);
  }
}

/**
 * Confirm that user feels heard and can proceed
 * POST /sessions/:id/feel-heard
 */
export async function confirmFeelHeard(
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
    const parseResult = feelHeardRequestSchema.safeParse(req.body);
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

    const { confirmed, feedback } = parseResult.data;

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

    // Get user's current stage progress (needed for both status check and stage validation)
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
      },
      orderBy: { stage: 'desc' },
    });

    // Check session allows feel-heard confirmation
    // Allow ACTIVE status for all users, and INVITED status for:
    // 1. The session creator, OR
    // 2. Users who have already joined (have stage progress) - defensive check for edge cases
    if (session.status !== 'ACTIVE') {
      if (session.status === 'INVITED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        const hasJoined = !!progress; // User has stage progress, meaning they've joined

        if (!isCreator && !hasJoined) {
          errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
          return;
        }

        // If user has joined but session status is still INVITED, update it to ACTIVE
        // This handles edge cases where status wasn't updated on invitation acceptance
        if (hasJoined && !isCreator) {
          await prisma.session.update({
            where: { id: sessionId },
            data: { status: 'ACTIVE' },
          });
          console.log(`[confirmFeelHeard] Updated session ${sessionId} status to ACTIVE (user has joined)`);
        }
        // Creator can proceed while session is INVITED
      } else {
        errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
        return;
      }
    }

    // Check user is in stage 1
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 1) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot confirm feel-heard: you are in stage ${currentStage}, but stage 1 is required`,
        400
      );
      return;
    }

    // Build gates satisfied data (use names that match Stage1Gates interface)
    const gatesSatisfied = {
      feelHeardConfirmed: confirmed,
      feelHeardConfirmedAt: new Date().toISOString(),
      finalEmotionalReading: null, // Can be updated later with final barometer reading
      ...(feedback ? { feedback } : {}),
    } satisfies Prisma.InputJsonValue;

    const now = new Date();
    const confirmedAt = now.toISOString();

    // Update stage progress - mark Stage 1 as COMPLETED when confirmed
    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId: user.id,
          stage: 1,
        },
      },
      data: {
        gatesSatisfied,
        status: confirmed ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: confirmed ? now : null,
      },
    });

    // When confirmed, advance user to Stage 2 immediately
    // This ensures they get Stage 2 prompts with empathy statement capability
    let advancedToStage2 = false;
    if (confirmed) {
      // Check if Stage 2 record already exists (shouldn't, but be safe)
      const existingStage2 = await prisma.stageProgress.findUnique({
        where: {
          sessionId_userId_stage: {
            sessionId,
            userId: user.id,
            stage: 2,
          },
        },
      });

      if (!existingStage2) {
        await prisma.stageProgress.create({
          data: {
            sessionId,
            userId: user.id,
            stage: 2,
            status: 'IN_PROGRESS',
            startedAt: now,
            gatesSatisfied: {},
          },
        });
        advancedToStage2 = true;
        console.log(`[confirmFeelHeard] Advanced user ${user.id} to Stage 2`);
      }
    }

    // Generate AI transition message when user confirms they feel heard
    let transitionMessage: {
      id: string;
      content: string;
      timestamp: string;
      stage: number;
    } | null = null;

    if (confirmed) {
      try {
        // Get partner name for the transition message
        const partnerId = await getPartnerUserId(sessionId, user.id);
        let partnerName: string | undefined;
        if (partnerId) {
          const partner = await prisma.user.findUnique({
            where: { id: partnerId },
            select: { name: true },
          });
          partnerName = partner?.name || undefined;
        } else {
          // Get from invitation if partner hasn't joined yet
          const invitation = await prisma.invitation.findFirst({
            where: { sessionId, invitedById: user.id },
            select: { name: true },
          });
          partnerName = invitation?.name || undefined;
        }

        // Fetch Stage 1 conversation history for context
        const conversationHistory = await prisma.message.findMany({
          where: {
            sessionId,
            stage: 1,
            OR: [{ senderId: user.id }, { role: 'AI', forUserId: user.id }],
          },
          orderBy: { timestamp: 'asc' },
          take: 15, // Get recent context
          select: {
            role: true,
            content: true,
          },
        });

        // Format conversation for context
        const conversationContext = conversationHistory
          .map((m) => `${m.role === 'USER' ? 'User' : 'AI'}: ${m.content}`)
          .join('\n\n');

        // Build a context-aware transition prompt for Stage 1 → Stage 2
        const userName = user.name || 'The user';
        const partner = partnerName || 'their partner';
        const transitionPrompt = `You are Meet Without Fear, a Process Guardian. ${userName} has been sharing their experience and has confirmed they feel fully heard. Now you'll help ${userName} build empathy by imagining ${partner}'s experience.

HERE IS THE CONVERSATION FROM STAGE 1 (what ${userName} shared while feeling heard):
---
${conversationContext}
---

Based on this specific conversation, generate a brief, warm transition message (2-3 sentences) that:
1. References something SPECIFIC that ${userName} shared (an emotion, situation, or concern they mentioned)
2. Acknowledges their experience in a way that shows you remember what they said
3. Naturally bridges to wondering about ${partner}'s perspective with an open question

IMPORTANT GUIDANCE:
- Your transition should feel like a continuation of THIS conversation, not a generic script
- Reference actual themes, emotions, or situations ${userName} mentioned
- The transition should feel seamless - like a natural next thought in the conversation
- Avoid generic phrases like "you've shared so much" - be specific to what they actually shared
- Keep the same warm, conversational tone from the witnessing phase

Example (if user had shared feeling unheard and dismissed):
"I hear how painful it's been to feel dismissed, like your concerns aren't being taken seriously. I'm wondering - have you ever thought about what ${partner} might be experiencing when those moments happen? What do you imagine might be going on for them?"

Respond in JSON format:
\`\`\`json
{
  "response": "Your personalized transition message that references their specific sharing"
}
\`\`\``;

        const aiResponse = await getSonnetResponse({
          systemPrompt: transitionPrompt,
          messages: [{ role: 'user', content: 'Generate the transition message based on the conversation above.' }],
          maxTokens: 512,
          sessionId,
          turnId: `${sessionId}-feel-heard`,
          operation: 'stage1-transition',
        });

        let transitionContent: string;
        if (aiResponse) {
          try {
            const parsed = extractJsonFromResponse(aiResponse) as Record<string, unknown>;
            transitionContent = typeof parsed.response === 'string'
              ? parsed.response
              : `You've done important work sharing and being heard. When you're ready, I'm curious - have you ever wondered what ${partnerName || 'your partner'} might be experiencing in all this?`;
          } catch {
            transitionContent = `You've done important work sharing and being heard. When you're ready, I'm curious - have you ever wondered what ${partnerName || 'your partner'} might be experiencing in all this?`;
          }
        } else {
          transitionContent = `You've done important work sharing and being heard. When you're ready, I'm curious - have you ever wondered what ${partnerName || 'your partner'} might be experiencing in all this?`;
        }

        // Save the transition message to the database as Stage 2
        // This is the first message in the perspective-taking phase
        const aiMessage = await prisma.message.create({
          data: {
            sessionId,
            senderId: null,
            forUserId: user.id, // Track which user this AI response is for (data isolation)
            role: 'AI',
            content: transitionContent,
            stage: 2, // Stage 2 - perspective stretch begins
          },
        });

        // Embed for cross-session retrieval (non-blocking)
        // Use same turnId as the transition response for cost attribution
        embedMessage(aiMessage.id, `${sessionId}-feel-heard`).catch((err) =>
          console.warn('[confirmFeelHeard] Failed to embed transition message:', err)
        );

        transitionMessage = {
          id: aiMessage.id,
          content: aiMessage.content,
          timestamp: aiMessage.timestamp.toISOString(),
          stage: 2, // Stage 2 transition message
        };

        console.log(`[confirmFeelHeard] Generated transition message for session ${sessionId}`);

        // Audit log the transition message
        auditLog('RESPONSE', 'Stage transition message generated', {
          turnId: `${sessionId}-feel-heard`,
          sessionId,
          stage: 2,
          operation: 'stage1-transition',
          responseText: transitionContent,
          messageId: aiMessage.id,
        });
      } catch (error) {
        console.error('[confirmFeelHeard] Failed to generate transition message:', error);
        // Continue without transition message - not a critical failure
      }
    }

    // Check if partner has also completed
    const partnerCompleted = await hasPartnerCompletedStage1(sessionId, user.id);
    const canAdvance = confirmed && partnerCompleted;

    // Notify partner of stage completion
    if (confirmed) {
      const partnerId = await getPartnerUserId(sessionId, user.id);
      if (partnerId) {
        await notifyPartner(sessionId, partnerId, 'partner.stage_completed', {
          stage: 1,
          completedBy: user.id,
        });
      }
    }

    // If both partners are ready, publish advancement event
    if (canAdvance) {
      await publishSessionEvent(sessionId, 'partner.advanced', {
        fromStage: 1,
        toStage: 2,
      });
    }

    // NEW: Check if partner has an empathy attempt in HELD status
    // If so, trigger the asymmetric reconciler for that direction
    // (Partner = guesser, current user = subject whose Stage 1 is now complete)
    let reconcilerTriggered = false;
    let reconcilerResult: {
      empathyStatus: 'REVEALED' | 'AWAITING_SHARING';
      shareOffer: { suggestedContent: string; reason: string } | null;
    } | null = null;

    if (confirmed) {
      const partnerId = await getPartnerUserId(sessionId, user.id);
      if (partnerId) {
        // Check if partner has an empathy attempt in HELD status (waiting for us)
        const partnerEmpathyAttempt = await prisma.empathyAttempt.findFirst({
          where: {
            sessionId,
            sourceUserId: partnerId,
            status: 'HELD',
          },
        });

        if (partnerEmpathyAttempt) {
          console.log(`[confirmFeelHeard] Partner ${partnerId} has HELD empathy - triggering reconciler`);

          try {
            // Run reconciler for partner→user direction
            // Partner is the guesser (who wrote empathy about us)
            // Current user is the subject (whose Stage 1 content will be compared)
            const result = await runReconcilerForDirection(sessionId, partnerId, user.id);
            reconcilerTriggered = true;
            reconcilerResult = {
              empathyStatus: result.empathyStatus,
              shareOffer: result.shareOffer,
            };

            console.log(`[confirmFeelHeard] Reconciler result: status=${result.empathyStatus}`);

            // If there's a share suggestion, notify the current user (subject)
            if (result.empathyStatus === 'AWAITING_SHARING' && result.shareOffer) {
              await notifyPartner(sessionId, user.id, 'empathy.share_suggestion', {
                guesserName: session.relationship.members.find(m => m.userId === partnerId)
                  ? 'your partner'
                  : 'your partner',
                suggestedContent: result.shareOffer.suggestedContent,
              });
            }

            // If empathy was revealed directly (no gaps), notify the partner (guesser)
            if (result.empathyStatus === 'REVEALED') {
              await notifyPartner(sessionId, partnerId, 'empathy.revealed', {
                direction: 'outgoing',
              });
            }
          } catch (error) {
            console.error('[confirmFeelHeard] Failed to run reconciler:', error);
            // Continue without reconciler - not a critical failure for Stage 1 completion
          }
        }
      }
    }

    successResponse(res, {
      confirmed,
      confirmedAt,
      canAdvance,
      partnerCompleted,
      transitionMessage,
      advancedToStage: advancedToStage2 ? 2 : null,
      // New: Reconciler info if triggered
      reconcilerTriggered,
      reconcilerResult,
    });
  } catch (error) {
    console.error('[confirmFeelHeard] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm feel-heard', 500);
  }
}

/**
 * Get conversation history for the current user in a session
 * GET /sessions/:id/messages
 */
export async function getConversationHistory(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = `get-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  try {
    console.log(`[getConversationHistory:${requestId}] ========== REQUEST START ==========`);
    const user = req.user;
    if (!user) {
      console.log(`[getConversationHistory:${requestId}] ERROR: No user in request`);
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    console.log(`[getConversationHistory:${requestId}] Session ID: ${sessionId}, User ID: ${user.id}`);

    // Validate query params
    const parseResult = getMessagesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { limit, before, after, order } = parseResult.data;

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

    // Build cursor conditions
    const cursorCondition: Record<string, unknown> = {};
    if (before) {
      cursorCondition.timestamp = { lt: new Date(before) };
    }
    if (after) {
      cursorCondition.timestamp = { gt: new Date(after) };
    }

    // Get messages - only user's own messages and AI responses to them (data isolation)
    console.log(`[getConversationHistory:${requestId}] Fetching messages with limit=${limit}, before=${before || 'none'}, after=${after || 'none'}, order=${order}`);
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { senderId: user.id },
          { role: 'AI', forUserId: user.id },
        ],
        ...cursorCondition,
      },
      orderBy: { timestamp: order },
      take: limit + 1, // Fetch one extra to check for more
    });

    console.log(`[getConversationHistory:${requestId}] ✅ Fetched ${messages.length} messages from database`);

    // Check for duplicate message IDs
    const messageIds = messages.map(m => m.id);
    const duplicateIds = messageIds.filter((id, idx) => messageIds.indexOf(id) !== idx);
    if (duplicateIds.length > 0) {
      console.warn(`[getConversationHistory:${requestId}] ⚠️  WARNING: Found ${duplicateIds.length} duplicate message ID(s) in query result!`);
      duplicateIds.forEach(id => {
        const duplicates = messages.filter(m => m.id === id);
        console.warn(`[getConversationHistory:${requestId}]   Duplicate ID ${id}: appears ${duplicates.length} times`);
      });
    }

    // Check for duplicate content (same content, same role, within 1 second)
    const contentMap = new Map<string, typeof messages>();
    messages.forEach(m => {
      const key = `${m.role}:${m.content.substring(0, 100)}`;
      if (!contentMap.has(key)) {
        contentMap.set(key, []);
      }
      contentMap.get(key)!.push(m);
    });
    const duplicateContent = Array.from(contentMap.entries()).filter(([_, msgs]) => msgs.length > 1);
    if (duplicateContent.length > 0) {
      console.warn(`[getConversationHistory:${requestId}] ⚠️  WARNING: Found ${duplicateContent.length} message(s) with duplicate content!`);
      duplicateContent.forEach(([key, msgs]) => {
        console.warn(`[getConversationHistory:${requestId}]   Content "${key.substring(0, 50)}...": appears ${msgs.length} times`);
        msgs.forEach((msg, idx) => {
          console.warn(`[getConversationHistory:${requestId}]     ${idx + 1}. ID=${msg.id}, timestamp=${msg.timestamp.toISOString()}`);
        });
      });
    }

    // Log recent message IDs
    const recentMessages = messages.slice(0, 5);
    console.log(`[getConversationHistory:${requestId}] Recent 5 message IDs:`, recentMessages.map(m => `${m.role}:${m.id.substring(0, 8)}...`).join(', '));

    // Check if there are more messages
    const hasMore = messages.length > limit;
    let resultMessages = hasMore ? messages.slice(0, limit) : messages;

    console.log(`[getConversationHistory:${requestId}] Returning ${resultMessages.length} messages (hasMore=${hasMore})`);

    // If fetched in descending order, reverse to return chronological order for display
    // This allows us to fetch the latest N messages but display them oldest-first
    if (order === 'desc') {
      resultMessages = resultMessages.reverse();
    }

    successResponse(res, {
      messages: resultMessages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        senderId: m.senderId,
        role: m.role,
        content: m.content,
        stage: m.stage,
        timestamp: m.timestamp.toISOString(),
      })),
      hasMore,
    });
  } catch (error) {
    console.error('[getConversationHistory] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get messages', 500);
  }
}

/**
 * Get AI-generated initial message for a session/stage
 * POST /sessions/:id/messages/initial
 */
export async function getInitialMessage(
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
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check if there are already messages in this session for this user (data isolation)
    const existingMessages = await prisma.message.findFirst({
      where: {
        sessionId,
        OR: [
          { senderId: user.id },
          { role: 'AI', forUserId: user.id },
        ],
      },
    });

    if (existingMessages) {
      // Already has messages, don't generate a new initial message
      errorResponse(res, 'VALIDATION_ERROR', 'Session already has messages', 400);
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

    const currentStage = progress?.stage ?? 0;

    // Determine if this is the invitation phase
    const isInvitationPhase = session.status === 'CREATED';

    // Get user's first name
    const userName = user.firstName || user.name || 'there';

    // Find the session's invitation to determine inviter/invitee status
    const invitation = await prisma.invitation.findFirst({
      where: { sessionId },
      select: { name: true, invitedById: true },
    });

    // Determine if the current user is the invitee (NOT the person who sent the invitation)
    const isInvitee = invitation ? invitation.invitedById !== user.id : false;

    // Get partner name - for inviter it's from the invitation, for invitee it's from the inviter
    let partnerName: string | undefined;
    if (isInvitee) {
      // Invitee: partner is the inviter
      const inviter = await prisma.user.findUnique({
        where: { id: invitation?.invitedById },
        select: { firstName: true, name: true },
      });
      partnerName = inviter?.firstName || inviter?.name || undefined;
    } else {
      // Inviter: partner name is from the invitation
      partnerName = invitation?.name || undefined;
    }

    // Build the initial message prompt
    const prompt = buildInitialMessagePrompt(
      currentStage,
      { userName, partnerName, isInvitee },
      isInvitationPhase
    );

    // Get AI response
    let responseContent: string;
    try {
      // AWS Bedrock requires conversations to start with a user message
      const aiResponse = await getSonnetResponse({
        systemPrompt: prompt,
        messages: [{ role: 'user', content: 'Please generate an initial greeting.' }],
        maxTokens: 512,
        sessionId,
        turnId: `${sessionId}-welcome`,
        operation: 'stage1-initial-message',
      });

      if (aiResponse) {
        // Parse the JSON response
        const parsed = extractJsonFromResponse(aiResponse) as Record<string, unknown>;
        responseContent = typeof parsed.response === 'string'
          ? parsed.response
          : getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
      } else {
        // Fallback if AI unavailable
        responseContent = getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
      }
    } catch (error) {
      console.error('[getInitialMessage] AI response error:', error);
      responseContent = getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
    }

    // Save the AI message
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: user.id, // Track which user this AI response is for (data isolation)
        role: 'AI',
        content: responseContent,
        stage: currentStage,
      },
    });

    // Embed initial message for cross-session retrieval (non-blocking)
    // Use same turnId as the welcome response for cost attribution
    embedMessage(aiMessage.id, `${sessionId}-welcome`).catch((err) =>
      console.warn('[getInitialMessage] Failed to embed message:', err)
    );

    console.log(`[getInitialMessage] Generated initial message for session ${sessionId}, stage ${currentStage}`);

    // Audit log the initial message
    auditLog('RESPONSE', 'Initial welcome message generated', {
      turnId: `${sessionId}-welcome`,
      sessionId,
      stage: currentStage,
      userName,
      partnerName,
      isInvitee,
      responseText: responseContent,
      messageId: aiMessage.id,
    });

    successResponse(res, {
      message: {
        id: aiMessage.id,
        sessionId: aiMessage.sessionId,
        senderId: aiMessage.senderId,
        role: aiMessage.role,
        content: aiMessage.content,
        stage: aiMessage.stage,
        timestamp: aiMessage.timestamp.toISOString(),
      },
    });
  } catch (error) {
    console.error('[getInitialMessage] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get initial message', 500);
  }
}
