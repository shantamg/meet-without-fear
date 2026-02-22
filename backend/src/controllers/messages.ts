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
import { getSonnetResponse, getSonnetStreamingResponse, BrainActivityCallType, isMockLLMEnabled } from '../lib/bedrock';
import { brainService } from '../services/brain-service';
import { buildInitialMessagePrompt, buildStagePrompt, buildStagePromptString, type PromptContext } from '../services/stage-prompts';
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
import { runPartnerSessionClassifier, ensureFactIds, CategorizedFactWithId } from '../services/partner-session-classifier';
import { consolidateGlobalFacts } from '../services/global-memory';
import { assembleContextBundle, formatContextForPrompt } from '../services/context-assembler';
import type { MemoryIntentResult } from '../services/memory-intent';
import { handleDispatch, type DispatchContext } from '../services/dispatch-handler';
import { getMilestoneContext, getSharedContentContext } from '../services/shared-context';
import { CONTEXT_WINDOW, trimConversationHistory } from '../utils/token-budget';
import { estimateContextSizes, finalizeTurnMetrics, recordContextSizes } from '../services/llm-telemetry';

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
 * @deprecated This endpoint is deprecated. Use POST /sessions/:id/messages/stream instead.
 * The streaming endpoint provides real-time token streaming and better error handling.
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  console.warn('[sendMessage] DEPRECATED: Fire-and-forget endpoint called. Clients should use /messages/stream instead.');

  errorResponse(
    res,
    'ENDPOINT_DEPRECATED',
    'This endpoint is deprecated. Please use POST /sessions/:id/messages/stream for SSE streaming.',
    410 // HTTP 410 Gone
  );
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
            timestamp: true,
          },
        });

        // Build Stage 2 transition prompt using the standard prompt pipeline
        const userName = user.name || 'The user';
        const promptContext: PromptContext = {
          userName,
          partnerName,
          turnCount: 1,
          emotionalIntensity: 5,
          contextBundle: {
            conversationContext: {
              recentTurns: conversationHistory.map((m) => ({
                role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
                content: m.content,
                timestamp: m.timestamp.toISOString(),
              })),
              turnCount: conversationHistory.filter((m) => m.role === 'USER').length,
              sessionDurationMinutes: 0,
            },
            emotionalThread: {
              initialIntensity: null,
              currentIntensity: null,
              trend: 'unknown',
              notableShifts: [],
            },
            stageContext: {
              stage: 2,
              gatesSatisfied: {},
            },
            userName,
            partnerName,
            intent: {
              intent: 'stage_enforcement',
              depth: 'minimal',
              reason: 'Stage 1→2 transition',
              threshold: 0.60,
              maxCrossSession: 0,
              allowCrossSession: false,
              surfaceStyle: 'silent',
            },
            assembledAt: new Date().toISOString(),
          },
        };

        const transitionPrompt = buildStagePrompt(2, promptContext, {
          isStageTransition: true,
          previousStage: 1,
        });

        // Pass conversation history as proper messages
        const messages = conversationHistory.map((m) => ({
          role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
          content: m.content,
        }));

        // Bedrock requires conversations to start with a user message
        // Add a brief user message if history is empty or starts with assistant
        if (messages.length === 0 || messages[0].role !== 'user') {
          messages.unshift({ role: 'user', content: 'I feel heard now.' });
        }

        const aiResponse = await getSonnetResponse({
          systemPrompt: transitionPrompt,
          messages,
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
              // Note: We DON'T exclude the user here because they ARE the intended recipient
              // Include full empathy status to avoid extra HTTP round-trip
              if (result.empathyStatus === 'AWAITING_SHARING' && result.shareOffer) {
                console.log(`[confirmFeelHeard] Significant gaps found - notifying subject ${user.id} of share suggestion`);
                const { buildEmpathyExchangeStatus } = await import('../services/empathy-status');
                const empathyStatus = await buildEmpathyExchangeStatus(sessionId, user.id);
                await notifyPartner(sessionId, user.id, 'empathy.share_suggestion', {
                  // Include forUserId so mobile can filter - only the subject should see the modal
                  forUserId: user.id,
                  guesserName: session.relationship.members.find(m => m.userId === partnerId)
                    ? 'your partner'
                    : 'your partner',
                  suggestedContent: result.shareOffer.suggestedContent,
                  suggestedReason: (result.shareOffer as any).reason || (result.shareOffer as any).suggestedReason,
                  empathyStatus,
                  // Include triggeredByUserId for event tracing
                  triggeredByUserId: user.id,
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
      prompt = buildStagePromptString(0, {
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
    // Get conversation history for context (summary-aware)
    // =========================================================================
    const existingSummary = await getSessionSummary(sessionId, user.id);
    const summaryBoundary = existingSummary?.summary.newestMessageAt;
    const historyLimit = summaryBoundary ? 30 : 20;

    const historyDesc = await prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { senderId: user.id, forUserId: null },
          { forUserId: user.id },
        ],
        ...(summaryBoundary ? { timestamp: { gt: summaryBoundary } } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: historyLimit,
    });
    const history = historyDesc.slice().reverse();

    // Count ALL user messages for this session (not just from the limited history window)
    // This prevents turn IDs from getting stuck when conversation exceeds 20 messages
    const userTurnCount = await prisma.message.count({
      where: {
        sessionId,
        role: 'USER',
        senderId: user.id,
        forUserId: null,
      },
    });
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
    } else if (session.status === 'CREATED' || session.status === 'INVITED') {
      // Partner hasn't joined yet - get name from invitation
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { name: true },
      });
      partnerName = invitation?.name || undefined;
    }

    // Build stage prompt with full context assembly (includes notable facts)
    const userName = user.name || 'there';
    const isInvitationPhase = session.status === 'CREATED';

    // Detect invitation refinement request (e.g., "Refine invitation: make it warmer")
    const isRefiningInvitation = content.toLowerCase().startsWith('refine invitation:');
    let currentInvitationMessage: string | null = null;

    if (isRefiningInvitation) {
      // Fetch current invitation message for context
      const invitation = await prisma.invitation.findFirst({
        where: { sessionId, invitedById: user.id },
        select: { invitationMessage: true },
      });
      currentInvitationMessage = invitation?.invitationMessage ?? null;
      console.log(`[sendMessageStream:${requestId}] Refining invitation, current: "${currentInvitationMessage}"`);
    }

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
    // Also fetch latest emotional reading for intensity-dependent prompt behavior
    const [contextBundle, sharedContentHistory, milestoneContext, emotionalIntensity] = await Promise.all([
      assembleContextBundle(
        sessionId,
        user.id,
        currentStage,
        streamingIntent
      ),
      getSharedContentContext(sessionId, user.id).catch((err: Error) => {
        console.warn(`[sendMessageStream:${requestId}] Shared content context fetch failed:`, err);
        return null;
      }),
      getMilestoneContext(sessionId, user.id).catch((err: Error) => {
        console.warn(`[sendMessageStream:${requestId}] Milestone context fetch failed:`, err);
        return null;
      }),
      (async () => {
        const vessel = await prisma.userVessel.findUnique({
          where: { userId_sessionId: { userId: user.id, sessionId } },
          select: { id: true },
        });
        if (vessel) {
          const latestReading = await prisma.emotionalReading.findFirst({
            where: { vesselId: vessel.id },
            orderBy: { timestamp: 'desc' },
            select: { intensity: true },
          });
          if (latestReading) return latestReading.intensity;
        }
        return 5; // Default if no reading
      })(),
    ]);

    console.log(`[sendMessageStream:${requestId}] Context assembled: notableFacts=${contextBundle.notableFacts?.length ?? 0}, emotionalIntensity=${emotionalIntensity}`);

    const prompt = buildStagePrompt(currentStage, {
      userName,
      partnerName,
      turnCount: userTurnCount,
      emotionalIntensity,
      contextBundle,
      sharedContentHistory,
      milestoneContext,
      invitationMessage: currentInvitationMessage,
    }, { isInvitationPhase, isRefiningInvitation });

    // Prompt already includes semantic tag format instructions via buildResponseProtocol()
    // No tool use instruction needed - we parse <thinking>, <draft>, <dispatch> tags instead

    // Format context bundle and inject into last user message (includes notable facts)
    const formattedContext = formatContextForPrompt(contextBundle, {
      sharedContentHistory,
      milestoneContext,
    });
    console.log(`[sendMessageStream:${requestId}] Formatted context: ${formattedContext.length} chars`);

    // Filter out empty messages to prevent Bedrock ValidationException
    const validHistory = history.filter((m) => m.content && m.content.trim().length > 0);
    if (validHistory.length !== history.length) {
      console.warn(`[sendMessageStream:${requestId}] Filtered out ${history.length - validHistory.length} empty message(s) from history`);
    }

    const summaryExists = Boolean(summaryBoundary);
    const { trimmed: trimmedHistory, truncated } = trimConversationHistory(
      validHistory.map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      summaryExists ? CONTEXT_WINDOW.recentTurnsWithSummary : CONTEXT_WINDOW.recentTurnsWithoutSummary
    );

    if (truncated > 0) {
      console.log(`[sendMessageStream:${requestId}] Trimmed ${truncated} old messages (summaryExists=${summaryExists})`);
    }

    // Build messages with context injected into the last user message
    const messagesWithContext = trimmedHistory.map((m, i) => {
      const isLastUserMessage = i === trimmedHistory.length - 1 && m.role === 'user';
      const content = isLastUserMessage && formattedContext.trim()
        ? `Context:\n${formattedContext}\n\nUser message: ${m.content}`
        : m.content;
      return {
        role: m.role,
        content,
      };
    });

    recordContextSizes(turnId, estimateContextSizes({
      pinned: `${prompt.staticBlock}\n\n${prompt.dynamicBlock}`,
      summary: formattedContext,
      recentMessages: trimmedHistory,
      rag: '',
    }));

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
    let dispatchTagContent = ''; // Store dispatch tag content for handling
    let isDispatchMessage = false; // Track if this is a dispatch response (skip processing)

    try {
      const streamGenerator = getSonnetStreamingResponse({
        systemPrompt: prompt,
        messages: messagesWithContext,
        // No tools needed - using semantic tag format (<thinking>, <draft>, <dispatch>)
        maxTokens: 1536,
        sessionId,
        turnId,
        operation: 'streaming-response',
        callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
        // For E2E mock mode: response index is 0-based (userTurnCount is 1-based after save)
        mockResponseIndex: Math.max(0, userTurnCount - 1),
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

        // Extract dispatch tag if present - store for handling after streaming
        const dispatchMatch = buffer.match(/<dispatch>([\s\S]*?)<\/dispatch>/i);
        if (dispatchMatch) {
          dispatchTagContent = dispatchMatch[1].trim();
          console.log(`[sendMessageStream:${requestId}] [DISPATCH TAG]:`, dispatchTagContent);
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
            const combined = tagTrapBuffer + event.text;

            // Check if we have unclosed tags that need buffering
            const hasUnclosedDispatch = combined.includes('<dispatch>') && !combined.includes('</dispatch>');
            const hasUnclosedDraft = combined.includes('<draft>') && !combined.includes('</draft>');
            const hasPotentialTagStart = /<\/?d[a-z]*$/i.test(combined);

            if (hasUnclosedDispatch || hasUnclosedDraft || hasPotentialTagStart) {
              // Buffer and wait for closing tag
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

      // =========================================================================
      // SAFETY FLUSH: Handle AI responses that don't follow expected format
      // If stream ends while still waiting for </thinking>, the AI likely skipped
      // the thinking block entirely (e.g., dispatch-only response). Flush the
      // thinkingBuffer as visible content so dispatch tags can be parsed.
      // =========================================================================
      if (isInsideThinking && thinkingBuffer.length > 0) {
        console.warn(`[sendMessageStream:${requestId}] Stream ended while still in thinking trap. Buffer has ${thinkingBuffer.length} chars. Flushing as visible content.`);
        // The buffer might contain <dispatch>...</dispatch> without a thinking block
        // Process it through the tag processor to extract dispatch tags
        const cleanText = processTagTrapBuffer(thinkingBuffer);
        sendCleanText(cleanText);
        // Store the raw buffer as "thinking" for downstream parsing to find dispatch tags
        thinkingContent = thinkingBuffer;
        thinkingBuffer = '';
        isInsideThinking = false;
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
        // Draft is used for invitation (stage 0 or refinement) or empathy statement (stage 2)
        if (isInvitationPhase || isRefiningInvitation || currentStage === 0) {
          metadata.invitationMessage = draft;
        } else if (currentStage === 2) {
          metadata.proposedEmpathyStatement = draft;
        }
      }

      console.log(`[sendMessageStream:${requestId}] Parsed metadata:`, {
        offerFeelHeardCheck: metadata.offerFeelHeardCheck,
        offerReadyToShare: metadata.offerReadyToShare,
        hasDraft: !!parsed.draft,
        dispatchTag: dispatchTagContent || parsed.dispatchTag,
      });

      // Clean accumulated text (strip <draft> and <dispatch> tags if they leaked through)
      accumulatedText = parsed.response;

      // =========================================================================
      // DISPATCH HANDLING: If dispatch tag detected, get and stream dispatched response
      // Dispatch messages are system responses - skip classifier/embeddings
      // Use dispatchTagContent captured during streaming (more reliable than re-parsing)
      // =========================================================================
      const dispatchTag = dispatchTagContent || parsed.dispatchTag;
      if (dispatchTag) {
        console.log(`[sendMessageStream:${requestId}] Dispatch detected: ${dispatchTag}`);
        isDispatchMessage = true;

        // Build dispatch context with conversation history and session state
        const dispatchContext: DispatchContext = {
          userMessage: content,
          conversationHistory: history.map((m) => ({
            role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
            content: m.content,
          })),
          userName,
          partnerName,
          sessionId,
          turnId,
          currentStage,
          invitationSent: session.status !== 'CREATED', // INVITED or ACTIVE means sent
          partnerJoined: session.status === 'ACTIVE',
        };

        const dispatchedResponse = await handleDispatch(dispatchTag, dispatchContext);

        // Use ONLY the dispatch response - ignore any acknowledgment text the AI may have sent
        // (The prompt instructs AI to not send visible text, but in case it does, we ignore it)
        console.log(`[sendMessageStream:${requestId}] Dispatch response only (ignoring any streamed acknowledgment)`);
        sendSSE(res, { event: 'chunk', data: { text: dispatchedResponse } });
        accumulatedText = dispatchedResponse;
      }

      finalizeTurnMetrics(turnId);

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

    // Save invitation message (during initial crafting or refinement)
    if ((isInvitationPhase || isRefiningInvitation) && metadata.invitationMessage) {
      await prisma.invitation.updateMany({
        where: { sessionId, invitedById: user.id },
        data: {
          invitationMessage: metadata.invitationMessage,
          // Don't reset messageConfirmed during refinement - user may have already confirmed
          ...(isInvitationPhase ? { messageConfirmed: false } : {}),
        },
      });
      console.log(`[sendMessageStream:${requestId}] Saved invitation message: "${metadata.invitationMessage}"`);
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
    // Skip for dispatch messages - they're system responses, not user conversation
    // =========================================================================
    if (isDispatchMessage) {
      console.log(`[sendMessageStream:${requestId}] Skipping background tasks for dispatch message`);
    } else if (isMockLLMEnabled()) {
      console.log(`[sendMessageStream:${requestId}] Skipping background tasks in mock LLM mode`);
    } else {
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
          // Extract existing facts with IDs for diff-based updates
          // Legacy facts (without IDs) get UUIDs assigned via ensureFactIds
          const existingFactsWithIds: CategorizedFactWithId[] = (() => {
            if (!userVessel?.notableFacts) return [];
            const facts = userVessel.notableFacts as unknown;
            if (Array.isArray(facts)) {
              // Check if it's CategorizedFact[] or CategorizedFactWithId[] format
              if (facts.length > 0 && typeof facts[0] === 'object' && 'fact' in facts[0]) {
                // New format with category/fact (may or may not have IDs)
                return ensureFactIds(facts as CategorizedFactWithId[]);
              }
              // Old format: string[] - convert to CategorizedFactWithId
              return ensureFactIds(
                facts
                  .filter((f): f is string => typeof f === 'string')
                  .map((f) => ({ category: 'Unknown', fact: f }))
              );
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
            existingFactsWithIds,
          });

          console.log(`[sendMessageStream:${requestId}] ✅ Classification finished:`, {
            factsCount: result?.notableFacts?.length ?? 0,
            topicContext: result?.topicContext?.substring(0, 50),
          });
        } catch (err) {
          console.error(`[sendMessageStream:${requestId}] ❌ Classification failed:`, err);
        }
      })();
    }

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
