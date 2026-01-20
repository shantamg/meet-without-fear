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
import { getSonnetResponse, getSonnetStreamingResponse, BrainActivityCallType } from '../lib/bedrock';
import { brainService } from '../services/brain-service';
import { buildInitialMessagePrompt, buildStagePrompt } from '../services/stage-prompts';
import { parseMicroTagResponse } from '../utils/micro-tag-parser';
import { type SessionStateToolInput } from '../services/stage-tools';
import {
  sendMessageRequestSchema,
  feelHeardRequestSchema,
  getMessagesQuerySchema,
  MessageRole,
} from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent, notifySessionMembers, publishMessageAIResponse, publishMessageError } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId, isSessionCreator } from '../utils/session';
import { embedSessionContent } from '../services/embedding';
import { updateSessionSummary, getSessionSummary } from '../services/conversation-summarizer';
import { runReconcilerForDirection, getSharedContextForGuesser } from '../services/reconciler';
import { updateContext } from '../lib/request-context';
import { runPartnerSessionClassifier } from '../services/partner-session-classifier';
import { consolidateGlobalFacts } from '../services/global-memory';
import { assembleContextBundle, formatContextForPrompt } from '../services/context-assembler';
import type { MemoryIntentResult } from '../services/memory-intent';
import { handleDispatch } from '../services/dispatch-handler';

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
 *
 * Fire-and-forget pattern:
 * 1. Synchronously validate, check permissions, and save user message
 * 2. Return immediately with user message (fast response)
 * 3. Process AI response in background
 * 4. Deliver AI response via Ably when complete
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  const requestStartTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`[sendMessage:${requestId}] ========== FIRE-AND-FORGET REQUEST START ==========`);
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

    // =========================================================================
    // SYNCHRONOUS: Save user message (this is fast)
    // =========================================================================
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

    // Broadcast to Status Site
    brainService.broadcastMessage(userMessage);

    // =========================================================================
    // Mark shared content as SEEN if user is in REFINING status
    // (guesser sending first message after receiving shared context)
    // =========================================================================
    if (currentStage === 2) {
      const empathyAttempt = await prisma.empathyAttempt.findFirst({
        where: { sessionId, sourceUserId: user.id },
      });

      if (empathyAttempt?.status === 'REFINING') {
        // Update the share offer delivery status to SEEN (if not already)
        await prisma.reconcilerShareOffer.updateMany({
          where: {
            result: { guesserId: user.id, sessionId },
            deliveryStatus: 'DELIVERED',
          },
          data: {
            deliveryStatus: 'SEEN',
            seenAt: new Date(),
          },
        });
        console.log(`[sendMessage:${requestId}] Marked shared content as SEEN for guesser ${user.id}`);
      }
    }

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

    // =========================================================================
    // FIRE-AND-FORGET: Return immediately with user message
    // =========================================================================
    const syncTime = Date.now() - requestStartTime;
    console.log(`[sendMessage:${requestId}] ========== RETURNING IMMEDIATELY ==========`);
    console.log(`[sendMessage:${requestId}] Sync response time: ${syncTime}ms`);
    console.log(`[sendMessage:${requestId}] Returning user message, AI will be delivered via Ably`);

    // Return user message immediately - AI response will come via Ably
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
      // No AI response in sync response - it will arrive via Ably
      aiResponse: null,
      // These will be delivered via Ably with the AI response
      offerFeelHeardCheck: undefined,
      offerReadyToShare: undefined,
      invitationMessage: undefined,
      proposedEmpathyStatement: undefined,
    });

    // =========================================================================
    // ASYNC: Process AI response in background
    // =========================================================================
    // Capture variables needed for background processing
    const backgroundContext = {
      requestId,
      sessionId,
      userId: user.id,
      userName: user.name || 'there',
      content,
      lowerContent: content.toLowerCase(),
      currentStage,
      sessionStatus: session.status,
      sessionCreatedAt: session.createdAt,
      progressId: progress?.id,
      progressGatesSatisfied: progress?.gatesSatisfied as Record<string, unknown> | null,
      userMessageId: userMessage.id,
    };

    // Process AI response in background (non-blocking)
    processAIResponseInBackground(backgroundContext).catch((error) => {
      console.error(`[sendMessage:${requestId}] Background AI processing failed:`, error);
      // Publish error to user via Ably
      publishMessageError(
        sessionId,
        user.id,
        userMessage.id,
        'Sorry, I had trouble processing your message. Please try again.',
        true
      ).catch((ablyError) => {
        console.error(`[sendMessage:${requestId}] Failed to publish error via Ably:`, ablyError);
      });
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
 * Background processor for AI response generation.
 * This runs after the HTTP response has been sent to the client.
 */
async function processAIResponseInBackground(ctx: {
  requestId: string;
  sessionId: string;
  userId: string;
  userName: string;
  content: string;
  lowerContent: string;
  currentStage: number;
  sessionStatus: string;
  sessionCreatedAt: Date;
  progressId?: string;
  progressGatesSatisfied: Record<string, unknown> | null;
  userMessageId: string;
}): Promise<void> {
  const { requestId, sessionId, userId, userName, content, lowerContent, currentStage, sessionStatus, sessionCreatedAt, progressId, progressGatesSatisfied, userMessageId } = ctx;

  console.log(`[sendMessage:${requestId}] ========== BACKGROUND AI PROCESSING START ==========`);
  const backgroundStartTime = Date.now();

  try {
    // Get conversation history for context (only this user's messages and AI responses to them)
    // Check if a summary exists to avoid fetching messages already covered by summary
    console.log(`[sendMessage:${requestId}] [BG] Fetching conversation history...`);
    const historyStartTime = Date.now();

    // Check for existing summary to avoid "lazy eviction" - fetching messages already summarized
    const existingSummary = await getSessionSummary(sessionId, userId);
    const summaryBoundary = existingSummary?.summary.newestMessageAt;

    if (summaryBoundary) {
      console.log(`[sendMessage:${requestId}] [BG] Summary exists, fetching messages after ${summaryBoundary.toISOString()}`);
    }

    // Determine how many messages to fetch based on whether summary exists
    // If summary exists, fetch all messages after boundary (~15 based on recentMessagesToKeep)
    // If no summary, limit to 20 to avoid excessive context
    const historyLimit = summaryBoundary ? 30 : 20;

    const historyDesc = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { senderId: userId, forUserId: null },
          { forUserId: userId },
        ],
        // If summary exists, only fetch messages AFTER the summary boundary
        // This prevents duplicate context (summary + raw messages covering same content)
        ...(summaryBoundary ? { timestamp: { gt: summaryBoundary } } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: historyLimit,
    });
    const history = historyDesc.slice().reverse();
    console.log(`[sendMessage:${requestId}] [BG] ✅ History fetched: ${history.length} messages (took ${Date.now() - historyStartTime}ms)${summaryBoundary ? ' [summary-aware]' : ''}`);

    // Count user turns for AI context
    const userTurnCount = history.filter((m) => m.role === 'USER').length;
    console.log(`[sendMessage:${requestId}] [BG] User turn count: ${userTurnCount}`);

    // Fetch existing notable facts for the classifier (fire-and-forget)
    const userVessel = await prisma.userVessel.findUnique({
      where: {
        userId_sessionId: { userId, sessionId },
      },
      select: { notableFacts: true },
    });
    // Extract fact strings from JSON structure (supports both old string[] and new CategorizedFact[])
    const existingFacts: string[] = (() => {
      if (!userVessel?.notableFacts) return [];
      const facts = userVessel.notableFacts as unknown;
      if (Array.isArray(facts)) {
        // Check if it's CategorizedFact[] (has category and fact properties)
        if (facts.length > 0 && typeof facts[0] === 'object' && 'fact' in facts[0]) {
          return facts.map((f: { fact: string }) => f.fact);
        }
        // Old format: string[]
        return facts.filter((f): f is string => typeof f === 'string');
      }
      return [];
    })();

    // Generate turnId for this user action (includes userId to differentiate users)
    const turnId = `${sessionId}-${userId}-${userTurnCount}`;
    // Update request context so all downstream code can access this turnId
    updateContext({ turnId, sessionId, userId });

    // Detect stage transition
    const userMessage = history.find((m) => m.id === userMessageId);
    const previousStage1Messages = history.filter(
      (m) => m.stage === 1 && m.senderId === userId && m.id !== userMessageId
    );
    const hasStage0Messages = history.some((m) => m.stage === 0);
    const isStageTransition = hasStage0Messages && previousStage1Messages.length === 0;

    let previousStage: number | undefined;
    if (isStageTransition) {
      const previousStages = history
        .filter((m) => m.stage !== currentStage)
        .map((m) => m.stage);
      if (previousStages.length > 0) {
        previousStage = Math.max(...previousStages);
      }
    }

    // Get partner name for context
    const partnerId = await getPartnerUserId(sessionId, userId);
    let partnerName: string | undefined;
    if (partnerId) {
      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { name: true },
      });
      partnerName = partner?.name || undefined;
    } else if (sessionStatus === 'CREATED') {
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: userId },
        select: { name: true },
      });
      partnerName = invitation?.name || undefined;
    }

    // Calculate session duration
    const sessionDurationMinutes = Math.floor((Date.now() - sessionCreatedAt.getTime()) / 60000);

    // Determine context flags
    const isFirstTurnInSession = userTurnCount === 1;
    const isInvitationPhase = sessionStatus === 'CREATED';
    const isOnboarding = currentStage === 0 && !isInvitationPhase && !progressGatesSatisfied?.compactSigned;
    const isRefiningInvitation =
      sessionStatus === 'INVITED' &&
      lowerContent.includes('refine') &&
      lowerContent.includes('invitation');

    // Fetch current invitation message for refinement context
    let currentInvitationMessage: string | null = null;
    if (isRefiningInvitation || isInvitationPhase) {
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: userId },
        select: { invitationMessage: true, name: true },
      });
      currentInvitationMessage = invitation?.invitationMessage || null;
      if (!partnerName && invitation?.name) {
        partnerName = invitation.name;
      }
    }

    // Fetch current empathy draft for refinement context (Stage 2)
    let currentEmpathyDraft: string | null = null;
    let isRefiningEmpathy = false;
    let sharedContextFromPartner: string | null = null;
    if (currentStage === 2) {
      const draft = await prisma.empathyDraft.findUnique({
        where: {
          sessionId_userId: {
            sessionId,
            userId,
          },
        },
        select: { content: true },
      });

      currentEmpathyDraft = draft?.content || null;

      // Check if user is in reconciler refining flow (received shared context from partner)
      const empathyAttempt = await prisma.empathyAttempt.findFirst({
        where: { sessionId, sourceUserId: userId },
        select: { status: true },
      });
      const isInReconcilerRefining = empathyAttempt?.status === 'REFINING';

      // User is refining empathy if:
      // 1. They're in the reconciler refining flow (status = REFINING, received shared context), OR
      // 2. They explicitly mention refinement keywords
      const refinementKeywords = ['refine empathy draft', 'refine', 'edit', 'change', 'update', 'tweak', 'adjust', 'revise', 'direct', 'tone', 'shorter', 'longer'];
      isRefiningEmpathy =
        isInReconcilerRefining ||
        refinementKeywords.some((keyword) => lowerContent.includes(keyword)) ||
        lowerContent.includes('add more') ||
        lowerContent.includes('make it shorter') ||
        lowerContent.includes('make it longer');

      // Fetch shared context from partner if user is in reconciler refining flow
      if (isInReconcilerRefining) {
        console.log(`[sendMessage:${requestId}] [BG] User ${userId} is in reconciler refining flow - setting isRefiningEmpathy=true`);
        const contextResult = await getSharedContextForGuesser(sessionId, userId);
        if (contextResult.hasSharedContext && contextResult.content) {
          sharedContextFromPartner = contextResult.content;
          console.log(`[sendMessage:${requestId}] [BG] Fetched shared context from partner: ${sharedContextFromPartner.substring(0, 50)}...`);
        }
      }
    }

    // Build full context for orchestrated response
    const aiContext: FullAIContext = {
      sessionId,
      userId,
      turnId,
      userName,
      partnerName,
      stage: currentStage,
      turnCount: userTurnCount,
      emotionalIntensity: 5,
      sessionDurationMinutes,
      isFirstTurnInSession,
      isInvitationPhase: isInvitationPhase || isRefiningInvitation,
      isRefiningInvitation,
      isStageTransition,
      previousStage,
      currentInvitationMessage,
      currentEmpathyDraft,
      isRefiningEmpathy,
      sharedContextFromPartner,
      isOnboarding,
    };

    // Get AI response using full orchestration pipeline
    console.log(`[sendMessage:${requestId}] [BG] Calling orchestrator with ${history.length} messages...`);
    const orchestratorStartTime = Date.now();
    const orchestratorResult = await getOrchestratedResponse(
      history.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      aiContext
    );
    const orchestratorTime = Date.now() - orchestratorStartTime;
    console.log(`[sendMessage:${requestId}] [BG] ✅ Orchestrator completed in ${orchestratorTime}ms`);
    console.log(`[sendMessage:${requestId}] [BG] Orchestrator result: intent=${orchestratorResult.memoryIntent.intent}, mock=${orchestratorResult.usedMock}`);

    // Run partner session classifier AFTER orchestrator (fire-and-forget)
    // This allows us to pass Sonnet's analysis to inform fact extraction
    console.log(`[sendMessage:${requestId}] [BG] 🚀 Triggering background classification (with Sonnet analysis)...`);
    runPartnerSessionClassifier({
      userMessage: content,
      conversationHistory: history.slice(-5).map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      sessionId,
      userId,
      turnId,
      partnerName,
      existingFacts,
      sonnetAnalysis: orchestratorResult.analysis,
      sonnetResponse: orchestratorResult.response,
    })
      .then((result) => {
        console.log(`[sendMessage:${requestId}] [BG] ✅ Classification finished:`, {
          factsCount: result?.notableFacts?.length ?? 0,
          topicContext: result?.topicContext?.substring(0, 50),
        });
      })
      .catch((err) => {
        console.error(`[sendMessage:${requestId}] [BG] ❌ Classification failed:`, err);
      });

    // Stage 1: If AI recommends feel-heard check, persist to stage progress
    if (currentStage === 1 && orchestratorResult.offerFeelHeardCheck && progressId) {
      try {
        const currentGates = progressGatesSatisfied ?? {};
        await prisma.stageProgress.update({
          where: { id: progressId },
          data: {
            gatesSatisfied: {
              ...currentGates,
              feelHeardCheckOffered: true,
            },
          },
        });
        console.log(`[sendMessage:${requestId}] [BG] Stage 1: Persisted feelHeardCheckOffered=true`);
      } catch (err) {
        console.warn(`[sendMessage:${requestId}] [BG] Failed to persist feelHeardCheckOffered:`, err);
      }
    }

    const aiResponseContent = orchestratorResult.response;
    const extractedInvitationMessage = orchestratorResult.invitationMessage ?? null;

    // Only save invitation message during invitation phase
    if ((isInvitationPhase || isRefiningInvitation) && extractedInvitationMessage) {
      console.log(`[sendMessage:${requestId}] [BG] Extracted invitation draft: "${extractedInvitationMessage}"`);
      await prisma.invitation.updateMany({
        where: { sessionId, invitedById: userId },
        data: {
          invitationMessage: extractedInvitationMessage,
          messageConfirmed: false
        },
      });
    }

    // Stage 2: If AI is offering ready-to-share, auto-save the empathy draft
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
              userId,
            },
          },
          create: {
            sessionId,
            userId,
            content: orchestratorResult.proposedEmpathyStatement,
            readyToShare: false,
            version: 1,
          },
          update: {
            content: orchestratorResult.proposedEmpathyStatement,
            version: { increment: 1 },
          },
        });
        console.log(`[sendMessage:${requestId}] [BG] Stage 2: Auto-saved empathy draft`);
      } catch (err) {
        console.error(`[sendMessage:${requestId}] [BG] Failed to auto-save empathy draft:`, err);
      }
    }

    // =========================================================================
    // TWO-MESSAGE DISPATCH FLOW
    // When dispatch is triggered with an initial response, we send two messages:
    // 1. First message (AI's acknowledgment) with expectingMore: true
    // 2. Second message (dispatched response) with expectingMore: false
    // =========================================================================
    const hasTwoMessageFlow = orchestratorResult.initialResponse && orchestratorResult.dispatchedResponse;

    if (hasTwoMessageFlow) {
      // Extract values (we know they exist when hasTwoMessageFlow is true)
      const initialResponseContent = orchestratorResult.initialResponse!;
      const dispatchedResponseContent = orchestratorResult.dispatchedResponse!;

      console.log(`[sendMessage:${requestId}] [BG] Two-message dispatch flow detected for tag: ${orchestratorResult.dispatchTag}`);

      // FIRST MESSAGE: AI's acknowledgment
      console.log(`[sendMessage:${requestId}] [BG] Creating first AI message (acknowledgment)...`);
      const firstAiMessage = await prisma.message.create({
        data: {
          sessionId,
          senderId: null,
          forUserId: userId,
          role: 'AI',
          content: initialResponseContent.trim(),
          stage: currentStage,
        },
      });
      console.log(`[sendMessage:${requestId}] [BG] ✅ First AI message created: ID=${firstAiMessage.id}`);
      brainService.broadcastMessage(firstAiMessage);

      // Publish first message with expectingMore: true
      await publishMessageAIResponse(
        sessionId,
        userId,
        {
          id: firstAiMessage.id,
          sessionId: firstAiMessage.sessionId,
          senderId: firstAiMessage.senderId,
          role: MessageRole.AI,
          content: firstAiMessage.content,
          stage: firstAiMessage.stage,
          timestamp: firstAiMessage.timestamp.toISOString(),
        },
        {
          expectingMore: true,
        }
      );
      console.log(`[sendMessage:${requestId}] [BG] First message published with expectingMore: true`);

      // SECOND MESSAGE: Dispatched response
      console.log(`[sendMessage:${requestId}] [BG] Creating second AI message (dispatched response)...`);
      const secondAiMessage = await prisma.message.create({
        data: {
          sessionId,
          senderId: null,
          forUserId: userId,
          role: 'AI',
          content: dispatchedResponseContent.trim(),
          stage: currentStage,
        },
      });
      console.log(`[sendMessage:${requestId}] [BG] ✅ Second AI message created: ID=${secondAiMessage.id}`);
      brainService.broadcastMessage(secondAiMessage);

      // Publish second message with expectingMore: false
      await publishMessageAIResponse(
        sessionId,
        userId,
        {
          id: secondAiMessage.id,
          sessionId: secondAiMessage.sessionId,
          senderId: secondAiMessage.senderId,
          role: MessageRole.AI,
          content: secondAiMessage.content,
          stage: secondAiMessage.stage,
          timestamp: secondAiMessage.timestamp.toISOString(),
        },
        {
          expectingMore: false,
        }
      );
      console.log(`[sendMessage:${requestId}] [BG] Second message published with expectingMore: false`);

      // Summarize and embed after both messages
      updateSessionSummary(sessionId, userId, turnId)
        .then(() => embedSessionContent(sessionId, userId, turnId))
        .catch((err: unknown) =>
          console.warn(`[sendMessage:${requestId}] [BG] Failed to update summary/embedding:`, err)
        );
    } else {
      // =========================================================================
      // SINGLE MESSAGE FLOW (standard path)
      // =========================================================================
      // Save AI response (trim whitespace that Claude sometimes adds)
      console.log(`[sendMessage:${requestId}] [BG] Creating AI message in database...`);
      const aiMessage = await prisma.message.create({
        data: {
          sessionId,
          senderId: null,
          forUserId: userId,
          role: 'AI',
          content: aiResponseContent.trim(),
          stage: currentStage,
        },
      });
      console.log(`[sendMessage:${requestId}] [BG] ✅ AI message created: ID=${aiMessage.id}`);

      // Broadcast text to Status Site
      brainService.broadcastMessage(aiMessage);

      // Summarize and embed session content for cross-session retrieval (non-blocking)
      // Per fact-ledger architecture, we embed at session level after summary updates
      updateSessionSummary(sessionId, userId, turnId)
        .then(() => embedSessionContent(sessionId, userId, turnId))
        .catch((err: unknown) =>
          console.warn(`[sendMessage:${requestId}] [BG] Failed to update summary/embedding:`, err)
        );

      // =========================================================================
      // PUBLISH AI RESPONSE VIA ABLY
      // =========================================================================
      console.log(`[sendMessage:${requestId}] [BG] Publishing AI response via Ably...`);
      await publishMessageAIResponse(
        sessionId,
        userId,
        {
          id: aiMessage.id,
          sessionId: aiMessage.sessionId,
          senderId: aiMessage.senderId,
          role: MessageRole.AI,
          content: aiMessage.content,
          stage: aiMessage.stage,
          timestamp: aiMessage.timestamp.toISOString(),
        },
        {
          offerFeelHeardCheck: orchestratorResult.offerFeelHeardCheck,
          invitationMessage: extractedInvitationMessage,
          offerReadyToShare: orchestratorResult.offerReadyToShare,
          proposedEmpathyStatement: orchestratorResult.proposedEmpathyStatement ?? null,
        }
      );
    }

    const totalBackgroundTime = Date.now() - backgroundStartTime;
    console.log(`[sendMessage:${requestId}] ========== BACKGROUND AI PROCESSING COMPLETE ==========`);
    console.log(`[sendMessage:${requestId}] [BG] Total background processing time: ${totalBackgroundTime}ms`);

  } catch (error) {
    console.error(`[sendMessage:${requestId}] [BG] Error in background processing:`, error);
    throw error; // Re-throw so the caller can handle it
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

    // Generate turnId for this user action
    const turnId = `${sessionId}-${user.id}-feel-heard`;
    // Update request context so all downstream code can access this turnId
    updateContext({ turnId, sessionId, userId: user.id });

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
            OR: [
              // Messages user sent without a specific recipient
              { senderId: user.id, forUserId: null },
              // Messages specifically for this user
              { forUserId: user.id },
            ],
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

RESPONSE FORMAT:
<thinking>
Brief internal analysis of what ${userName} shared
</thinking>

Your personalized transition message here (just the text, no tags around it).`;

        const aiResponse = await getSonnetResponse({
          systemPrompt: transitionPrompt,
          messages: [{ role: 'user', content: 'Generate the transition message based on the conversation above.' }],
          maxTokens: 512,
          sessionId,
          turnId,
          operation: 'stage1-transition',
          callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
        });

        let transitionContent: string;
        if (aiResponse) {
          // Parse the semantic tag response (micro-tag format)
          const parsed = parseMicroTagResponse(aiResponse);
          transitionContent = parsed.response.trim() || `You've done important work sharing and being heard. When you're ready, I'm curious - have you ever wondered what ${partnerName || 'your partner'} might be experiencing in all this?`;
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
            content: transitionContent.trim(),
            stage: 2, // Stage 2 - perspective stretch begins
          },
        });

        // Embed session content for cross-session retrieval (non-blocking)
        // Per fact-ledger architecture, we embed at session level
        embedSessionContent(sessionId, user.id, turnId).catch((err: unknown) =>
          console.warn('[confirmFeelHeard] Failed to embed session content:', err)
        );

        transitionMessage = {
          id: aiMessage.id,
          content: aiMessage.content,
          timestamp: aiMessage.timestamp.toISOString(),
          stage: 2, // Stage 2 transition message
        };

        console.log(`[confirmFeelHeard] Generated transition message for session ${sessionId}`);

        // Audit log the transition message
        /* auditLog('RESPONSE', 'Stage transition message generated', {
          turnId,
          sessionId,
          userId: user.id,
          stage: 2,
          operation: 'stage1-transition',
          responseText: transitionContent,
          messageId: aiMessage.id,
        }); */
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

      // Consolidate global facts when Stage 1 completes (fire-and-forget)
      // Per fact-ledger architecture, we merge session facts into user's global profile
      consolidateGlobalFacts(user.id, sessionId, turnId).catch((err: unknown) =>
        console.warn('[confirmFeelHeard] Failed to consolidate global facts:', err)
      );
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
          console.log(`[confirmFeelHeard] Partner ${partnerId} has HELD empathy - triggering reconciler (non-blocking)`);

          // Trigger reconciler in the background
          (async () => {
            try {
              console.log(`[confirmFeelHeard] Calling runReconcilerForDirection for sessionId=${sessionId}, guesserId=${partnerId}, subjectId=${user.id}`);
              const result = await runReconcilerForDirection(sessionId, partnerId, user.id);

              console.log(`[confirmFeelHeard] Reconciler completed: status=${result.empathyStatus}, hasSuggestion=${!!result.shareOffer}`);

              // If there's a share suggestion, notify the current user (subject)
              if (result.empathyStatus === 'AWAITING_SHARING' && result.shareOffer) {
                console.log(`[confirmFeelHeard] Significant gaps found - notifying subject ${user.id} of share suggestion`);
                await notifyPartner(sessionId, user.id, 'empathy.share_suggestion', {
                  guesserName: session.relationship.members.find(m => m.userId === partnerId)
                    ? 'your partner'
                    : 'your partner',
                  suggestedContent: result.shareOffer.suggestedContent,
                  suggestedReason: (result.shareOffer as any).reason || (result.shareOffer as any).suggestedReason,
                });
              }

              // If empathy is READY (no gaps), the guesser already got the alignment message.
              // The reveal notification will be sent when both directions are READY.
              if (result.empathyStatus === 'READY') {
                console.log(`[confirmFeelHeard] No significant gaps - empathy marked READY, waiting for partner to complete Stage 2`);
              }
            } catch (error) {
              console.error('[confirmFeelHeard] Reconciler background task failed:', error);
            }
          })();
          reconcilerTriggered = true;
        } else {
          console.log(`[confirmFeelHeard] Partner ${partnerId} does not have HELD empathy - reconciler NOT triggered`);
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
      reconcilerTriggered,
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

    // Get messages - user's own messages (without specific recipient) + messages specifically for them
    // This ensures data isolation: messages with forUserId only show to that user
    console.log(`[getConversationHistory:${requestId}] Fetching messages with limit=${limit}, before=${before || 'none'}, after=${after || 'none'}, order=${order}`);
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          // Messages user sent without a specific recipient (broadcast to all, e.g., USER messages)
          { senderId: user.id, forUserId: null },
          // Messages specifically for this user (AI responses, SHARED_CONTEXT, etc.)
          { forUserId: user.id },
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
          // Messages user sent without a specific recipient
          { senderId: user.id, forUserId: null },
          // Messages specifically for this user
          { forUserId: user.id },
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

    // Check if this session originated from an Inner Thoughts session
    let innerThoughtsContext: { summary: string; themes: string[]; fullContext?: string } | undefined;
    if (!isInvitee && isInvitationPhase) {
      const originInnerThoughts = await prisma.innerWorkSession.findFirst({
        where: {
          linkedPartnerSessionId: sessionId,
          userId: user.id,
          linkedTrigger: 'suggestion_start',
        },
        select: {
          summary: true,
          theme: true,
          messages: {
            orderBy: { timestamp: 'asc' },
            select: { role: true, content: true }
          }
        },
      });

      if (originInnerThoughts) {
        // Build a richer context from the messages if available
        let fullContext = '';
        if (originInnerThoughts.messages.length > 0) {
          fullContext = originInnerThoughts.messages
            .map(m => `${m.role === 'USER' ? 'User' : 'AI'}: ${m.content}`)
            .join('\n\n');
        }

        innerThoughtsContext = {
          summary: originInnerThoughts.summary || '',
          themes: originInnerThoughts.theme ? [originInnerThoughts.theme] : [],
          fullContext: fullContext || undefined
        };
      }
    }

    // Build the initial message prompt
    let prompt: string;
    if (!isInvitee && isInvitationPhase && innerThoughtsContext) {
      // Use the actual invitation crafting prompt with extra context
      // This allows the AI to propose an invitation in the first message
      prompt = buildStagePrompt(0, {
        userName,
        partnerName,
        turnCount: 1,
        emotionalIntensity: 5,
        contextBundle: {
          conversationContext: {
            recentTurns: [],
            turnCount: 0,
            sessionDurationMinutes: 0,
          },
          emotionalThread: {
            initialIntensity: null,
            currentIntensity: null,
            trend: 'unknown',
            notableShifts: [],
          },
          stageContext: {
            stage: 0,
            gatesSatisfied: {},
          },
          userName,
          partnerName,
          intent: {
            intent: 'stage_enforcement',
            depth: 'minimal',
            reason: 'Stage 0 - onboarding with minimal context',
            threshold: 0.60,
            maxCrossSession: 0,
            allowCrossSession: false,
            surfaceStyle: 'silent',
          },
          assembledAt: new Date().toISOString(),
        },
        innerThoughtsContext,
      }, { isInvitationPhase: true });
    } else {
      prompt = buildInitialMessagePrompt(
        currentStage,
        { userName, partnerName, isInvitee, innerThoughtsContext },
        isInvitationPhase
      );
    }

    // Generate turnId for this user action - the invitee accessing their session
    const turnId = `${sessionId}-${user.id}-welcome`;
    // Update request context so all downstream code can access this turnId
    updateContext({ turnId, sessionId, userId: user.id });

    // Get AI response
    let responseContent: string;
    let extractedInvitationMessage: string | null = null;
    try {
      // AWS Bedrock requires conversations to start with a user message
      const aiResponse = await getSonnetResponse({
        systemPrompt: prompt,
        messages: [{ role: 'user', content: 'Please generate an initial greeting.' }],
        maxTokens: 512,
        sessionId,
        turnId,
        operation: 'stage1-initial-message',
        callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
      });

      if (aiResponse) {
        // Parse the semantic tag response (micro-tag format)
        const parsed = parseMicroTagResponse(aiResponse);
        responseContent = parsed.response.trim() || getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);

        // Draft is used for invitation message in stage 0
        if (isInvitationPhase && parsed.draft) {
          extractedInvitationMessage = parsed.draft;
        }
      } else {
        // Fallback if AI unavailable
        responseContent = getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
      }
    } catch (error) {
      console.error('[getInitialMessage] AI response error:', error);
      responseContent = getFallbackInitialMessage(userName, partnerName, isInvitationPhase, isInvitee);
    }

    // If an invitation message was extracted, update the invitation
    if (isInvitationPhase && extractedInvitationMessage) {
      console.log(`[getInitialMessage] Extracted invitation draft from initial message: "${extractedInvitationMessage}"`);
      await prisma.invitation.updateMany({
        where: { sessionId, invitedById: user.id },
        data: {
          invitationMessage: extractedInvitationMessage,
          messageConfirmed: false
        },
      });
    }

    // Save the AI message (trim whitespace that Claude sometimes adds)
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: user.id, // Track which user this AI response is for (data isolation)
        role: 'AI',
        content: responseContent.trim(),
        stage: currentStage,
      },
    });

    // Embed session content for cross-session retrieval (non-blocking)
    // Per fact-ledger architecture, we embed at session level
    embedSessionContent(sessionId, user.id, turnId).catch((err: unknown) =>
      console.warn('[getInitialMessage] Failed to embed session content:', err)
    );

    console.log(`[getInitialMessage] Generated initial message for session ${sessionId}, stage ${currentStage}`);

    // Audit log the initial message
    /* auditLog('RESPONSE', 'Initial welcome message generated', {
      turnId,
      sessionId,
      userId: user.id,
      stage: currentStage,
      userName,
      partnerName,
      isInvitee,
      responseText: responseContent,
      messageId: aiMessage.id,
      invitationMessage: extractedInvitationMessage,
    }); */

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
      invitationMessage: extractedInvitationMessage,
    });
  } catch (error) {
    console.error('[getInitialMessage] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get initial message', 500);
  }
}

// ============================================================================
// Streaming Endpoint (SSE)
// ============================================================================

/**
 * SSE event type definitions
 */
type SSEEvent =
  | { event: 'user_message'; data: { id: string; content: string; timestamp: string } }
  | { event: 'chunk'; data: { text: string } }
  | { event: 'metadata'; data: { metadata: SessionStateToolInput } }
  | { event: 'text_complete'; data: { metadata: SessionStateToolInput } }
  | { event: 'complete'; data: { messageId: string; metadata: SessionStateToolInput } }
  | { event: 'error'; data: { message: string; retryable: boolean } };

/**
 * Send SSE event to client
 */
function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Send a message with streaming AI response
 * POST /sessions/:id/messages/stream
 *
 * Uses Server-Sent Events (SSE) to stream the AI response in real-time.
 * Events:
 * - user_message: User message saved (includes ID)
 * - chunk: Text delta from AI
 * - text_complete: AI text finished streaming (sent before DB saves)
 * - complete: AI response complete (includes messageId and metadata)
 * - error: Error occurred (includes retryable flag)
 */
export async function sendMessageStream(req: Request, res: Response): Promise<void> {
  const requestId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Track if client disconnected
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
    console.log(`[sendMessageStream:${requestId}] Client disconnected`);
  });

  try {
    console.log(`[sendMessageStream:${requestId}] ========== SSE STREAM REQUEST START ==========`);

    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = sendMessageRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body', details: parseResult.error.issues });
      return;
    }

    const { content } = parseResult.data;

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
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Check session allows messaging
    if (session.status !== 'ACTIVE') {
      if (session.status === 'CREATED') {
        const isCreator = await isSessionCreator(sessionId, user.id);
        if (!isCreator) {
          res.status(400).json({ error: 'Session is not active' });
          return;
        }
      } else if (session.status !== 'INVITED') {
        res.status(400).json({ error: 'Session is not active' });
        return;
      }
    }

    // Get user's current stage progress
    let progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: { in: ['IN_PROGRESS', 'GATE_PENDING'] },
      },
      orderBy: { stage: 'desc' },
    });

    const currentStage = progress?.stage ?? 0;

    // =========================================================================
    // Save user message
    // =========================================================================
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: user.id,
        role: 'USER',
        content,
        stage: currentStage,
      },
    });
    console.log(`[sendMessageStream:${requestId}] User message created: ${userMessage.id}`);

    // Broadcast to Status Site
    brainService.broadcastMessage(userMessage);

    // =========================================================================
    // Set up SSE headers
    // =========================================================================
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send user_message event
    sendSSE(res, {
      event: 'user_message',
      data: {
        id: userMessage.id,
        content: userMessage.content,
        timestamp: userMessage.timestamp.toISOString(),
      },
    });

    // =========================================================================
    // Get conversation history for context
    // =========================================================================
    const historyDesc = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { senderId: user.id, forUserId: null },
          { forUserId: user.id },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });
    const history = historyDesc.slice().reverse();

    const userTurnCount = history.filter((m) => m.role === 'USER').length;
    const turnId = `${sessionId}-${user.id}-${userTurnCount}`;
    updateContext({ turnId, sessionId, userId: user.id });

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
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { name: true },
      });
      partnerName = invitation?.name || undefined;
    }

    // Build stage prompt with full context assembly (includes notable facts)
    const userName = user.name || 'there';
    const isInvitationPhase = session.status === 'CREATED';

    // Create intent for context assembly - use 'light' depth to load notable facts
    const streamingIntent: MemoryIntentResult = {
      intent: 'stage_enforcement',
      depth: 'light', // Changed from 'minimal' to ensure notable facts are included
      reason: 'Streaming response',
      threshold: 0.60,
      maxCrossSession: 0,
      allowCrossSession: false,
      surfaceStyle: 'silent',
    };

    // Assemble full context including notable facts from UserVessel
    const contextBundle = await assembleContextBundle(
      sessionId,
      user.id,
      currentStage,
      streamingIntent
    );

    console.log(`[sendMessageStream:${requestId}] Context assembled: notableFacts=${contextBundle.notableFacts?.length ?? 0}`);

    const prompt = buildStagePrompt(currentStage, {
      userName,
      partnerName,
      turnCount: userTurnCount,
      emotionalIntensity: 5,
      contextBundle,
    }, { isInvitationPhase });

    // Prompt already includes semantic tag format instructions via buildResponseProtocol()
    // No tool use instruction needed - we parse <thinking>, <draft>, <dispatch> tags instead

    // Format context bundle and inject into last user message (includes notable facts)
    const formattedContext = formatContextForPrompt(contextBundle);
    console.log(`[sendMessageStream:${requestId}] Formatted context: ${formattedContext.length} chars`);

    // Build messages with context injected into the last user message
    const messagesWithContext = history.map((m, i) => {
      const isLastUserMessage = i === history.length - 1 && m.role === 'USER';
      const content = isLastUserMessage && formattedContext.trim()
        ? `[Context for this turn:\n${formattedContext}]\n\n${m.content}`
        : m.content;
      return {
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content,
      };
    });

    // =========================================================================
    // Stream AI response (with analysis block trap)
    // =========================================================================
    let accumulatedText = '';
    let metadata: SessionStateToolInput = {};
    let streamError: Error | null = null;

    // Tag trap state - Claude outputs <thinking>...</thinking> first, which we hide
    // After thinking, there may be <draft>...</draft> or <dispatch>...</dispatch> that we also hide
    let isInsideThinking = true;
    let isTrappingTags = false; // After thinking, buffer to check for <draft>/<dispatch>
    let thinkingBuffer = '';
    let tagTrapBuffer = ''; // Buffer for checking draft/dispatch tags after thinking
    let thinkingContent = ''; // Store hidden thinking for logging
    let draftContent = ''; // Store draft content for metadata

    try {
      const streamGenerator = getSonnetStreamingResponse({
        systemPrompt: prompt,
        messages: messagesWithContext,
        // No tools needed - using semantic tag format (<thinking>, <draft>, <dispatch>)
        maxTokens: 2048,
        sessionId,
        turnId,
        operation: 'streaming-response',
        callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
      });

      const streamStartTime = Date.now();
      let firstChunkTime: number | null = null;
      let lastChunkTime: number | null = null;
      let thinkingEndTime: number | null = null;

      /**
       * Helper to strip tags and send clean text to client
       * NOTE: Do NOT use .trim() on every chunk - it removes spaces between words when streaming
       * BUT we DO trimStart() on the FIRST chunk to remove leading newlines after </thinking>
       */
      const sendCleanText = (text: string) => {
        if (!text || clientDisconnected) return;

        // Strip any remaining tags that might have slipped through
        let cleanText = text
          .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
          .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '');

        // Trim LEADING whitespace only on the FIRST chunk (after </thinking> tag removal)
        // This removes newlines at the start without breaking word spacing in subsequent chunks
        if (!firstChunkTime && cleanText.length > 0) {
          cleanText = cleanText.trimStart();
        }

        if (cleanText.length > 0) {
          if (!firstChunkTime) firstChunkTime = Date.now();
          accumulatedText += cleanText;
          sendSSE(res, { event: 'chunk', data: { text: cleanText } });
        }
      };

      /**
       * Process the tag trap buffer - extract draft/dispatch and return clean response text
       */
      const processTagTrapBuffer = (buffer: string): string => {
        // Extract draft content if present
        const draftMatch = buffer.match(/<draft>([\s\S]*?)<\/draft>/i);
        if (draftMatch) {
          draftContent = draftMatch[1].trim();
          console.log(`[sendMessageStream:${requestId}] [HIDDEN DRAFT]:`, draftContent.substring(0, 100) + (draftContent.length > 100 ? '...' : ''));
        }

        // Extract dispatch tag if present (we log but don't act on it in streaming)
        const dispatchMatch = buffer.match(/<dispatch>([\s\S]*?)<\/dispatch>/i);
        if (dispatchMatch) {
          console.log(`[sendMessageStream:${requestId}] [DISPATCH TAG]:`, dispatchMatch[1]);
        }

        // Return text with all tags stripped
        // Do NOT use .trim() - it breaks word spacing between chunks
        return buffer
          .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
          .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '');
      };

      for await (const event of streamGenerator) {
        if (event.type === 'text') {
          lastChunkTime = Date.now();

          // PHASE 1: THINKING TRAP - Buffer until </thinking> is found
          if (isInsideThinking) {
            thinkingBuffer += event.text;

            // Check for closing tag
            const closingTagIndex = thinkingBuffer.indexOf('</thinking>');
            if (closingTagIndex !== -1) {
              // Thinking phase complete
              isInsideThinking = false;
              isTrappingTags = true; // Start tag trap phase
              thinkingEndTime = Date.now();

              // Extract and log the hidden thinking
              thinkingContent = thinkingBuffer.substring(0, closingTagIndex);
              console.log(`[sendMessageStream:${requestId}] [TIMING] Thinking phase complete at ${thinkingEndTime - streamStartTime}ms`);
              console.log(`[sendMessageStream:${requestId}] [HIDDEN THINKING]:`, thinkingContent.substring(0, 200) + (thinkingContent.length > 200 ? '...' : ''));

              // Put remaining text into tag trap buffer
              tagTrapBuffer = thinkingBuffer.substring(closingTagIndex + 11); // 11 = '</thinking>'.length
              thinkingBuffer = '';
            }
            // Safety: If buffer > 2000 chars without finding tag, assume no thinking and flush
            else if (thinkingBuffer.length > 2000) {
              console.warn(`[sendMessageStream:${requestId}] Thinking buffer exceeded 2000 chars without closing tag, flushing`);
              isInsideThinking = false;
              sendCleanText(thinkingBuffer);
              thinkingBuffer = '';
            }
          }
          // PHASE 2: TAG TRAP - Buffer to catch <draft> and <dispatch> before streaming
          // The draft tag typically comes right after </thinking>, before response text
          else if (isTrappingTags) {
            tagTrapBuffer += event.text;

            // Check for complete tags
            const hasDraftStart = tagTrapBuffer.includes('<draft>');
            const hasDraftEnd = tagTrapBuffer.includes('</draft>');
            const hasDispatchStart = tagTrapBuffer.includes('<dispatch>');
            const hasDispatchEnd = tagTrapBuffer.includes('</dispatch>');

            // Check for partial tag starts at the end of buffer
            // Matches: <, <d, <dr, </, </d, etc. - anything that could become <draft>, </draft>, <dispatch>, </dispatch>
            const hasPotentialTagStart = /<\/?d[a-z]*$/i.test(tagTrapBuffer);

            // If we see opening tags, wait for closing tags
            const waitingForDraft = hasDraftStart && !hasDraftEnd;
            const waitingForDispatch = hasDispatchStart && !hasDispatchEnd;

            // Process buffer and check if we can exit:
            // 1. Strip any complete tags from buffer
            // 2. Check if remaining content looks like response text (not starting with <)
            const strippedBuffer = tagTrapBuffer
              .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
              .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '');
            const trimmedStripped = strippedBuffer.trim();

            // Exit conditions:
            // - Not waiting for any tags to complete
            // - Have substantial response content (>50 chars that doesn't start with <)
            // - No partial tag at the end that might become <draft> or <dispatch>
            // OR buffer is too big (safety limit)
            const hasResponseContent = trimmedStripped.length > 50 && !trimmedStripped.startsWith('<');
            const safeToExit = !waitingForDraft && !waitingForDispatch && hasResponseContent && !hasPotentialTagStart;

            if (safeToExit || tagTrapBuffer.length > 2000) {
              isTrappingTags = false;
              const cleanText = processTagTrapBuffer(tagTrapBuffer);
              sendCleanText(cleanText);
              tagTrapBuffer = '';
            }
          }
          // PHASE 3: NORMAL STREAMING - Stream with safety buffer for late tags
          else {
            // Safety: If this chunk ends with what might be a tag start, buffer it
            const combined = tagTrapBuffer + event.text;
            const hasPotentialTagEnd = /<\/?d[a-z]*$/i.test(combined);

            if (hasPotentialTagEnd) {
              // Buffer and wait for next chunk to see if it completes a tag
              tagTrapBuffer = combined;
            } else {
              // Process any buffered content + new text
              const toProcess = combined;
              tagTrapBuffer = '';

              // Strip any complete tags that might have formed
              const cleanText = toProcess
                .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
                .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '');
              sendCleanText(cleanText);
            }
          }
        }
        // tool_use events are no longer expected with semantic router format
        // 'done' event is handled after the loop
      }

      // Flush any remaining buffer (safety for tags split across final chunks)
      if (tagTrapBuffer.length > 0) {
        const cleanText = processTagTrapBuffer(tagTrapBuffer);
        sendCleanText(cleanText);
      }

      const streamEndTime = Date.now();
      console.log(`[sendMessageStream:${requestId}] [TIMING] Stream complete:`,
        `total=${streamEndTime - streamStartTime}ms`,
        `thinkingEnd=${thinkingEndTime ? thinkingEndTime - streamStartTime : 'none'}ms`,
        `firstVisibleChunk=${firstChunkTime ? firstChunkTime - streamStartTime : 'none'}ms`,
        `lastChunk=${lastChunkTime ? lastChunkTime - streamStartTime : 'none'}ms`);

      // =========================================================================
      // Parse accumulated response for metadata (semantic router format)
      // The thinking content has flags like FeelHeardCheck:Y, ReadyShare:Y
      // The accumulated text may contain <draft>...</draft> that needs stripping
      // =========================================================================
      const fullResponse = `<thinking>${thinkingContent}</thinking>\n${accumulatedText}`;
      const parsed = parseMicroTagResponse(fullResponse);

      // Extract metadata from parsed response
      metadata.offerFeelHeardCheck = parsed.offerFeelHeardCheck;
      metadata.offerReadyToShare = parsed.offerReadyToShare;

      // Use draftContent captured during streaming (more reliable than re-parsing)
      const draft = draftContent || parsed.draft;
      if (draft) {
        // Draft is used for invitation (stage 0) or empathy statement (stage 2)
        if (isInvitationPhase || currentStage === 0) {
          metadata.invitationMessage = draft;
        } else if (currentStage === 2) {
          metadata.proposedEmpathyStatement = draft;
        }
      }

      console.log(`[sendMessageStream:${requestId}] Parsed metadata:`, {
        offerFeelHeardCheck: metadata.offerFeelHeardCheck,
        offerReadyToShare: metadata.offerReadyToShare,
        hasDraft: !!parsed.draft,
        dispatchTag: parsed.dispatchTag,
      });

      // Clean accumulated text (strip <draft> and <dispatch> tags if they leaked through)
      accumulatedText = parsed.response;

      // =========================================================================
      // DISPATCH HANDLING: If dispatch tag detected, get and stream dispatched response
      // =========================================================================
      if (parsed.dispatchTag) {
        console.log(`[sendMessageStream:${requestId}] Dispatch detected: ${parsed.dispatchTag}`);
        const dispatchedResponse = await handleDispatch(parsed.dispatchTag);

        // If AI provided an acknowledgment message, it's already in accumulatedText
        // Stream the dispatched response as a continuation
        if (accumulatedText.trim()) {
          // Two-part response: AI acknowledgment already streamed, now send dispatch content
          console.log(`[sendMessageStream:${requestId}] Two-part dispatch: acknowledgment="${accumulatedText.substring(0, 50)}..."`);
          // Send a separator and the dispatched response
          sendSSE(res, { event: 'chunk', data: { text: '\n\n' } });
          sendSSE(res, { event: 'chunk', data: { text: dispatchedResponse } });
          accumulatedText = accumulatedText.trim() + '\n\n' + dispatchedResponse;
        } else {
          // No acknowledgment - just use the dispatched response
          console.log(`[sendMessageStream:${requestId}] Single dispatch response (no acknowledgment)`);
          sendSSE(res, { event: 'chunk', data: { text: dispatchedResponse } });
          accumulatedText = dispatchedResponse;
        }
      }

    } catch (error) {
      console.error(`[sendMessageStream:${requestId}] Stream error:`, error);
      streamError = error instanceof Error ? error : new Error(String(error));
    }

    // =========================================================================
    // Handle stream error: Delete user message, send Ably error, no DB save
    // User can retry fresh (avoids duplicate messages on retry)
    // =========================================================================
    if (streamError) {
      console.error(`[sendMessageStream:${requestId}] Stream failed, cleaning up user message`);

      // Delete user message so retry creates fresh conversation turn
      await prisma.message.delete({ where: { id: userMessage.id } }).catch((deleteErr) => {
        console.warn(`[sendMessageStream:${requestId}] Failed to delete user message on error:`, deleteErr);
      });

      // Publish error via Ably so frontend can update UI (mark message as failed)
      await publishMessageError(
        sessionId,
        user.id,
        userMessage.id, // ID for frontend to identify which optimistic message failed
        'Sorry, I had trouble generating a response. Please try again.',
        true // canRetry
      ).catch((ablyErr) => {
        console.warn(`[sendMessageStream:${requestId}] Failed to publish error via Ably:`, ablyErr);
      });

      // Send SSE error event if client still connected
      if (!clientDisconnected) {
        sendSSE(res, {
          event: 'error',
          data: {
            message: 'An error occurred while generating the response.',
            retryable: true,
          },
        });
      }

      // End response and return early - do NOT save fallback AI message
      res.end();
      console.log(`[sendMessageStream:${requestId}] ========== SSE STREAM ENDED (ERROR) ==========`);
      return;
    }

    // =========================================================================
    // Signal that text streaming is complete (before DB saves for faster UX)
    // =========================================================================
    if (!clientDisconnected) {
      console.log(`[sendMessageStream:${requestId}] [TIMING] Sending text_complete with metadata:`,
        metadata.invitationMessage ? 'has invitationMessage' : 'no invitationMessage');
      sendSSE(res, { event: 'metadata', data: { metadata } });
      sendSSE(res, { event: 'text_complete', data: { metadata } });
    }

    // =========================================================================
    // Save AI message (only if streaming succeeded)
    // Trim whitespace that Claude sometimes adds
    // =========================================================================
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: user.id,
        role: 'AI',
        content: accumulatedText.trim(),
        stage: currentStage,
      },
    });
    console.log(`[sendMessageStream:${requestId}] AI message created: ${aiMessage.id}`);

    // Broadcast to Status Site
    brainService.broadcastMessage(aiMessage);

    // =========================================================================
    // Process metadata (persist to database)
    // =========================================================================
    if (currentStage === 1 && metadata.offerFeelHeardCheck && progress?.id) {
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
    }

    // Save invitation message
    if (isInvitationPhase && metadata.invitationMessage) {
      await prisma.invitation.updateMany({
        where: { sessionId, invitedById: user.id },
        data: {
          invitationMessage: metadata.invitationMessage,
          messageConfirmed: false,
        },
      });
    }

    // Save empathy draft
    if (currentStage === 2 && metadata.offerReadyToShare && metadata.proposedEmpathyStatement) {
      await prisma.empathyDraft.upsert({
        where: {
          sessionId_userId: { sessionId, userId: user.id },
        },
        create: {
          sessionId,
          userId: user.id,
          content: metadata.proposedEmpathyStatement,
          readyToShare: false,
          version: 1,
        },
        update: {
          content: metadata.proposedEmpathyStatement,
          version: { increment: 1 },
        },
      });
    }

    // =========================================================================
    // Send complete event (streamError case is handled above with early return)
    // =========================================================================
    if (!clientDisconnected) {
      sendSSE(res, {
        event: 'complete',
        data: {
          messageId: aiMessage.id,
          metadata,
        },
      });
    }

    // =========================================================================
    // Background tasks (non-blocking)
    // =========================================================================
    // Summarize and embed session content for cross-session retrieval
    // Per fact-ledger architecture, we embed at session level after summary updates
    updateSessionSummary(sessionId, user.id, turnId)
      .then(() => embedSessionContent(sessionId, user.id, turnId))
      .catch((err: unknown) =>
        console.warn(`[sendMessageStream:${requestId}] Failed to update summary/embedding:`, err)
      );

    // Run partner session classifier (fire-and-forget)
    // This extracts notable facts and detects memory intents
    console.log(`[sendMessageStream:${requestId}] 🚀 Triggering background classification...`);
    (async () => {
      try {
        // Fetch existing facts for the classifier
        const userVessel = await prisma.userVessel.findUnique({
          where: { userId_sessionId: { userId: user.id, sessionId } },
          select: { notableFacts: true },
        });
        // Extract fact strings from JSON structure (supports both old string[] and new CategorizedFact[])
        const existingFacts: string[] = (() => {
          if (!userVessel?.notableFacts) return [];
          const facts = userVessel.notableFacts as unknown;
          if (Array.isArray(facts)) {
            // Check if it's CategorizedFact[] (has category and fact properties)
            if (facts.length > 0 && typeof facts[0] === 'object' && 'fact' in facts[0]) {
              return facts.map((f: { fact: string }) => f.fact);
            }
            // Old format: string[]
            return facts.filter((f): f is string => typeof f === 'string');
          }
          return [];
        })();

        const result = await runPartnerSessionClassifier({
          userMessage: content,
          conversationHistory: history.slice(-5).map((m) => ({
            role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
            content: m.content,
          })),
          sessionId,
          userId: user.id,
          turnId,
          partnerName,
          existingFacts,
        });

        console.log(`[sendMessageStream:${requestId}] ✅ Classification finished:`, {
          factsCount: result?.notableFacts?.length ?? 0,
          topicContext: result?.topicContext?.substring(0, 50),
        });
      } catch (err) {
        console.error(`[sendMessageStream:${requestId}] ❌ Classification failed:`, err);
      }
    })();

    // End response
    res.end();
    console.log(`[sendMessageStream:${requestId}] ========== SSE STREAM COMPLETE ==========`);

  } catch (error) {
    console.error(`[sendMessageStream:${requestId}] Error:`, error);

    // If headers already sent, try to send error event
    if (res.headersSent) {
      try {
        sendSSE(res, {
          event: 'error',
          data: {
            message: 'An unexpected error occurred.',
            retryable: true,
          },
        });
        res.end();
      } catch {
        // Ignore - client may have disconnected
      }
    } else {
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
}
