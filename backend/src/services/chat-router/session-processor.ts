/**
 * Session Message Processor
 *
 * Processes messages within a session context - saves to database,
 * calls AI orchestrator, returns response. Used by chat router handlers
 * when a message needs to be processed in a session.
 */

import { prisma } from '../../lib/prisma';
import { getOrchestratedResponse, type FullAIContext } from '../ai';
import { getPartnerUserId } from '../../utils/session';
import { embedMessage } from '../embedding';
import { updateSessionSummary } from '../conversation-summarizer';

export interface SessionMessageInput {
  sessionId: string;
  userId: string;
  userName: string;
  content: string;
}

export interface SessionMessageResult {
  userMessage: {
    id: string;
    sessionId: string;
    senderId: string | null;
    role: string;
    content: string;
    stage: number;
    timestamp: string;
  };
  aiResponse: {
    id: string;
    sessionId: string;
    senderId: string | null;
    role: string;
    content: string;
    stage: number;
    timestamp: string;
  };
  /** Stage 1: AI determined user may be ready for feel-heard confirmation */
  offerFeelHeardCheck?: boolean;
  /** Stage 0: Proposed invitation message from AI */
  invitationMessage?: string | null;
  /** Stage 2: AI determined user is ready to share their empathy attempt */
  offerReadyToShare?: boolean;
  /** Stage 2: AI's proposed empathy statement summarizing user's understanding of partner */
  proposedEmpathyStatement?: string | null;
  // NOTE: Memory suggestions are handled by ai-orchestrator and broadcast via publishSessionEvent
}

/**
 * Process a message within a session.
 * Saves messages to database and gets AI response.
 */
export async function processSessionMessage(
  input: SessionMessageInput
): Promise<SessionMessageResult> {
  const { sessionId, userId, userName, content } = input;

  // Get session and stage progress
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      stageProgress: {
        where: { userId },
        orderBy: { stage: 'desc' },
        take: 1,
      },
      invitations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Determine current stage (default to 1 if no progress)
  let currentStage = session.stageProgress[0]?.stage ?? 0;

  // Auto-advance from Stage 0 to Stage 1 if compact is signed
  if (currentStage === 0) {
    const gates = session.stageProgress[0]?.gatesSatisfied as Record<string, unknown> | null;
    if (gates?.compactSigned) {
      // Complete Stage 0 and create Stage 1
      const now = new Date();
      if (session.stageProgress[0]) {
        await prisma.stageProgress.update({
          where: { id: session.stageProgress[0].id },
          data: { status: 'COMPLETED', completedAt: now },
        });
      }
      await prisma.stageProgress.create({
        data: {
          sessionId,
          userId,
          stage: 1,
          status: 'IN_PROGRESS',
          startedAt: now,
          gatesSatisfied: {},
        },
      });
      currentStage = 1;
    } else {
      // Default to Stage 1 for new sessions even without compact
      // (compact can be signed later)
      currentStage = 1;
    }
  }

  // Save user message
  const userMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: userId,
      role: 'USER',
      content,
      stage: currentStage,
    },
  });

  // NOTE: User message embedding moved below after turnId is generated

  // Get conversation history (only this user's messages and AI responses to them - data isolation)
  const history = await prisma.message.findMany({
    where: {
      sessionId,
      OR: [
        { senderId: userId },
        { role: 'AI', forUserId: userId },
      ],
    },
    orderBy: { timestamp: 'asc' },
    take: 20,
  });

  const userTurnCount = history.filter((m) => m.role === 'USER').length;

  // Detect stage transition: check if this is the first message in the current stage
  // A stage transition is detected when:
  // 1. There are previous messages in the session (not first message ever)
  // 2. No previous messages exist at the current stage for this user
  const previousStageMessages = history.filter(
    (m) => m.stage === currentStage && m.senderId === userId
  );
  const isStageTransition = history.length > 0 && previousStageMessages.length === 0;

  // If it's a stage transition, determine the previous stage
  let previousStage: number | undefined;
  if (isStageTransition && history.length > 0) {
    // Get the highest stage from previous messages
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
      select: { name: true, firstName: true },
    });
    partnerName = partner?.firstName || partner?.name || undefined;
  } else {
    // No partner yet - get nickname from relationship member
    const member = await prisma.relationshipMember.findFirst({
      where: {
        relationship: { sessions: { some: { id: sessionId } } },
        userId,
      },
      select: { nickname: true },
    });
    partnerName = member?.nickname || undefined;
  }

  // Calculate session duration
  const sessionDurationMinutes = Math.floor(
    (Date.now() - session.createdAt.getTime()) / 60000
  );

  // Determine if we're in invitation phase
  // Invitation phase: Stage 0 (or 1 if auto-advanced), session CREATED, invitation message not confirmed
  const invitation = session.invitations[0];
  const isInvitationPhase =
    session.status === 'CREATED' &&
    (!invitation?.messageConfirmed);

  // Generate turnId for this user action - used to group all costs from this message
  const turnId = `${sessionId}-${userTurnCount}`;

  // Build AI context
  const aiContext: FullAIContext = {
    sessionId,
    userId,
    turnId,
    userName,
    partnerName,
    stage: currentStage,
    turnCount: userTurnCount,
    emotionalIntensity: 5, // TODO: Get from emotional barometer
    sessionDurationMinutes,
    isFirstTurnInSession: userTurnCount === 1,
    isInvitationPhase,
    isStageTransition,
    previousStage,
  };

  if (isStageTransition) {
    console.log(
      `[SessionProcessor] Stage transition detected: ${previousStage ?? 'unknown'} → ${currentStage}`
    );
  }

  // Get AI response
  const orchestratorResult = await getOrchestratedResponse(
    history.map((m) => ({
      role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
    aiContext
  );

  console.log(
    `[SessionProcessor] Stage ${currentStage}, intent=${orchestratorResult.memoryIntent.intent}, mock=${orchestratorResult.usedMock}`
  );

  // Save AI response
  const aiMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: null,
      forUserId: userId, // Track which user this AI response is for (data isolation)
      role: 'AI',
      content: orchestratorResult.response,
      stage: currentStage,
    },
  });

  // Embed messages for cross-session retrieval (non-blocking)
  // Pass turnId so embedding cost is attributed to this user message
  embedMessage(userMessage.id, turnId).catch((err) =>
    console.warn('[SessionProcessor] Failed to embed user message:', err)
  );
  embedMessage(aiMessage.id, turnId).catch((err) =>
    console.warn('[SessionProcessor] Failed to embed AI message:', err)
  );

  // Summarize older parts of the conversation (non-blocking)
  // Pass turnId so summarization cost is attributed to this user message
  updateSessionSummary(sessionId, userId, turnId).catch((err) =>
    console.warn('[SessionProcessor] Failed to update session summary:', err)
  );

  // NOTE: Memory detection is handled by ai-orchestrator.ts, not here.
  // The orchestrator runs detection + validation synchronously before generating the response.

  // Stage 2: If AI is offering ready-to-share, auto-save the empathy draft
  // Save with readyToShare: false so user sees low-profile confirmation prompt first
  // User must explicitly confirm to see the full preview card
  if (currentStage === 2 && orchestratorResult.offerReadyToShare && orchestratorResult.proposedEmpathyStatement) {
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
          readyToShare: false, // User must confirm before seeing full preview
          version: 1,
        },
        update: {
          content: orchestratorResult.proposedEmpathyStatement,
          // Don't change readyToShare if draft already exists - user may have confirmed
          version: { increment: 1 },
        },
      });
      console.log(`[SessionProcessor] Stage 2: Auto-saved empathy draft for user ${userId}`);
    } catch (err) {
      console.error('[SessionProcessor] Failed to auto-save empathy draft:', err);
    }
  }

  return {
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
    offerFeelHeardCheck: orchestratorResult.offerFeelHeardCheck,
    invitationMessage: orchestratorResult.invitationMessage,
    offerReadyToShare: orchestratorResult.offerReadyToShare,
    proposedEmpathyStatement: orchestratorResult.proposedEmpathyStatement,
  };
}
