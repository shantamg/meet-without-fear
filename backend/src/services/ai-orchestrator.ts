/**
 * AI Orchestrator Service
 *
 * Orchestrates the multi-model AI pipeline for Meet Without Fear conversations.
 * Implements the two-model stratification:
 * - Haiku: Fast mechanics (retrieval planning, classification)
 * - Sonnet: Empathetic user-facing responses
 *
 * Flow:
 * 1. Determine memory intent (what kind of remembering is appropriate)
 * 2. Assemble context bundle (stage-scoped context)
 * 3. Plan retrieval using Haiku (optional, for full depth)
 * 4. Generate response using Sonnet
 */

import { getSonnetResponse, BrainActivityCallType } from '../lib/bedrock';
import { prisma } from '../lib/prisma';
import {
  determineMemoryIntent,
  type MemoryIntentContext,
  type MemoryIntentResult,
} from './memory-intent';
// Memory detection and validation moved to fire-and-forget (partner-session-classifier.ts)
import {
  assembleContextBundle,
  formatContextForPrompt,
  type ContextBundle,
} from './context-assembler';
import { planRetrieval, getMockRetrievalPlan, type RetrievalPlan } from './retrieval-planner';
import { buildStagePrompt } from './stage-prompts';
import {
  retrieveContext,
  formatRetrievedContext,
  type RetrievedContext,
} from './context-retriever';
import { brainService } from '../services/brain-service';
import { ActivityType } from '@prisma/client';
import { parseMicroTagResponse } from '../utils/micro-tag-parser';
import { handleDispatch, type DispatchContext } from './dispatch-handler';
import {
  decideSurfacing,
  userAskedForPattern,
  countPatternEvidence,
} from './surfacing-policy';
import { DEFAULT_MEMORY_PREFERENCES, type MemoryPreferencesDTO } from '@meet-without-fear/shared';
import {
  buildBudgetedContext,
  estimateTokens,
  getRecommendedLimits,
} from '../utils/token-budget';
import { getSharedContentContext, getMilestoneContext } from './shared-context';
import { publishContextUpdated } from './realtime';
// publishUserEvent and memoryService imports removed - handled in partner-session-classifier.ts

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorContext {
  sessionId: string;
  userId: string;
  /**
   * Unique identifier for this user action/turn.
   * All AI operations triggered by this turn should use the same turnId for cost attribution.
   */
  turnId: string;
  userName: string;
  partnerName?: string;
  stage: number;
  userMessage: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  turnCount: number;
  emotionalIntensity: number;
  sessionDurationMinutes?: number;
  isFirstTurnInSession?: boolean;
  /** Whether we're in the invitation crafting phase (stage 0, before partner joins) */
  isInvitationPhase?: boolean;
  /** Whether user is refining their invitation after Stage 1/2 processing */
  isRefiningInvitation?: boolean;
  /** Whether this is the first turn after advancing to a new stage (stage transition intro) */
  isStageTransition?: boolean;
  /** The stage we just transitioned from (for context gathering) */
  previousStage?: number;
  /** Current invitation message (for refinement context) */
  currentInvitationMessage?: string | null;
  /** Current empathy draft (for Stage 2 refinement context) */
  currentEmpathyDraft?: string | null;
  /** Whether the user is actively refining their empathy draft */
  isRefiningEmpathy?: boolean;
  /** Shared context from partner (when guesser is in REFINING status from reconciler flow) */
  sharedContextFromPartner?: string | null;
  /** Whether the user is in onboarding mode (compact not yet signed) */
  isOnboarding?: boolean;
}

export interface OrchestratorResult {
  response: string;
  memoryIntent: MemoryIntentResult;
  contextBundle: ContextBundle;
  retrievalPlan?: RetrievalPlan;
  retrievedContext?: RetrievedContext;
  usedMock: boolean;
  /** For Stage 1: AI determined user is ready for feel-heard check */
  offerFeelHeardCheck?: boolean;
  /** For Stage 2: AI determined user is ready to share empathy attempt */
  offerReadyToShare?: boolean;
  /** For Stage 0: Proposed invitation message */
  invitationMessage?: string | null;
  /** For Stage 2: Proposed empathy statement summarizing user's understanding */
  proposedEmpathyStatement?: string | null;
  /** Sonnet's internal analysis (for background classifier) */
  analysis?: string;
  /** When dispatch is triggered with an initial response, this contains the AI's acknowledgment */
  initialResponse?: string;
  /** When dispatch is triggered, this contains the dispatched response */
  dispatchedResponse?: string;
  /** The dispatch tag that was triggered (e.g., 'EXPLAIN_PROCESS') */
  dispatchTag?: string;
}

// ============================================================================
// User Preferences
// ============================================================================

/**
 * Get user's memory preferences from database.
 * Returns defaults if not set.
 */
async function getUserMemoryPreferences(userId: string): Promise<MemoryPreferencesDTO> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { memoryPreferences: true },
    });
    return (user?.memoryPreferences as MemoryPreferencesDTO | null) ?? DEFAULT_MEMORY_PREFERENCES;
  } catch (error) {
    console.warn('[AI Orchestrator] Failed to fetch memory preferences, using defaults:', error);
    return DEFAULT_MEMORY_PREFERENCES;
  }
}

// ============================================================================
// Orchestration
// ============================================================================

/**
 * Orchestrate the full AI response pipeline.
 * This is the main entry point for generating AI responses.
 */
export async function orchestrateResponse(
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const decisionStartTime = Date.now();

  // Use turnId from context for grouping all logs/costs from this message processing cycle
  const { turnId } = context;

  // Broadcast user message as the first event in this turn
  // Broadcast user message as the first event in this turn - captured in overarching activity or via specific USER event?
  // Ideally, the Orchestrator itself can be wrapped in a "Turn" activity, but for now we are removing AuditLog.

  // Step 1: Determine memory intent (DECISION LAYER - Time to Decision)
  const memoryIntentContext: MemoryIntentContext = {
    stage: context.stage,
    emotionalIntensity: context.emotionalIntensity,
    userMessage: context.userMessage,
    turnCount: context.turnCount,
    sessionDurationMinutes: context.sessionDurationMinutes,
    isFirstTurnInSession: context.isFirstTurnInSession,
  };

  const memoryIntent = determineMemoryIntent(memoryIntentContext);
  const decisionTime = Date.now() - decisionStartTime;
  console.log(`[AI Orchestrator] Memory intent: ${memoryIntent.intent} (${memoryIntent.depth}) [Decision: ${decisionTime}ms]`);

  if (decisionTime > 1000) {
    console.warn(`[AI Orchestrator] Decision layer took ${decisionTime}ms (>1s) - consider optimization`);
  }

  // PARALLEL PRE-PROCESSING: Run context assembly and retrieval in parallel
  // Memory detection moved to fire-and-forget (partner-session-classifier.ts)
  console.log(`[AI Orchestrator] Starting parallel pre-processing (Intent: ${memoryIntent.intent})...`);
  const parallelStartTime = Date.now();

  const [userPrefs, contextBundle, retrievedContext, sharedContentHistory, milestoneContext] = await Promise.all([
    getUserMemoryPreferences(context.userId),
    assembleContextBundle(
      context.sessionId,
      context.userId,
      context.stage,
      memoryIntent
    ),
    retrieveContext({
      userId: context.userId,
      currentMessage: context.userMessage,
      currentSessionId: context.sessionId,
      turnId,
      includePreSession: true,
      maxCrossSessionMessages: 10,
      similarityThreshold: 0.4,
      includeInnerThoughts: true,
      skipDetection: true, // Detection moved to fire-and-forget (partner-session-classifier.ts)
    }).catch((err: Error) => {
      console.warn('[AI Orchestrator] Context retrieval failed (parallel):', err);
      return undefined;
    }),
    getSharedContentContext(context.sessionId, context.userId).catch((err: Error) => {
      console.warn('[AI Orchestrator] Shared content context fetch failed:', err);
      return null;
    }),
    getMilestoneContext(context.sessionId, context.userId).catch((err: Error) => {
      console.warn('[AI Orchestrator] Milestone context fetch failed:', err);
      return null;
    })
  ]);

  const parallelTime = Date.now() - parallelStartTime;
  console.log(`[AI Orchestrator] Parallel pre-processing completed in ${parallelTime}ms`);

  // Publish context.updated event for Neural Monitor dashboard (fire-and-forget)
  publishContextUpdated(
    context.sessionId,
    context.userId,
    contextBundle.assembledAt
  ).catch((err) => {
    console.warn('[AI Orchestrator] Failed to publish context.updated event:', err);
  });

  // Memory detection and validation moved to fire-and-forget (partner-session-classifier.ts)
  // This reduces blocking latency for the user response

  // Log progress for parallel steps
  console.log(`[AI Orchestrator] Context assembled: ${contextBundle.conversationContext.turnCount} turns`);
  // Determine intent via BrainService monitoring (optional: log as separate activity or just console)
  // For now, we'll just log to console as the main response activity will capture the intent in metadata

  if (retrievedContext) {
    console.log(`[AI Orchestrator] Context retrieved: ${retrievedContext.retrievalSummary}`);
  }

  // Step 2.6: Apply surfacing policy
  const surfacingDecision = decideSurfacing(
    context.stage,
    context.turnCount,
    userAskedForPattern(context.userMessage),
    userPrefs.patternInsights,
    countPatternEvidence(retrievedContext ?? null),
    undefined // lastSurfacingTurn
  );
  console.log(`[AI Orchestrator] Surfacing decision: shouldSurface=${surfacingDecision.shouldSurface}, style=${surfacingDecision.style}`);

  // Step 3: Plan retrieval (for full depth, use Haiku)
  let retrievalPlan: RetrievalPlan | undefined;
  if (memoryIntent.depth === 'full') {
    try {
      retrievalPlan = await planRetrieval(
        context.stage,
        context.userId,
        context.sessionId,
        turnId,
        context.userMessage,
        memoryIntent.intent
      );
      console.log(`[AI Orchestrator] Retrieval planned: ${retrievalPlan.queries.length} queries`);
      console.log(`[AI Orchestrator] Retrieval planned: ${retrievalPlan.queries.length} queries`);
    } catch (error) {
      console.warn('[AI Orchestrator] Retrieval planning failed, using mock plan:', error);
      retrievalPlan = getMockRetrievalPlan(context.stage, context.userId);
    }
  }

  // Step 4: Build the stage-specific prompt
  // Add caution flag for high emotional intensity (8-9) - allows Sonnet to use memory
  // if it helps de-escalate, but warns to be extra careful
  const cautionAdvised = context.emotionalIntensity >= 8 && context.emotionalIntensity < 9;

  const systemPrompt = buildStagePrompt(
    context.stage,
    {
      userName: context.userName,
      partnerName: context.partnerName,
      turnCount: context.turnCount,
      emotionalIntensity: context.emotionalIntensity,
      contextBundle,
      isFirstMessage: context.isFirstTurnInSession,
      invitationMessage: context.currentInvitationMessage,
      empathyDraft: context.currentEmpathyDraft,
      isRefiningEmpathy: context.isRefiningEmpathy,
      sharedContextFromPartner: context.sharedContextFromPartner,
      surfacingStyle: surfacingDecision.style,
      cautionAdvised,
      // invalidMemoryRequest moved to fire-and-forget - not available at prompt-build time
      invalidMemoryRequest: undefined,
      sharedContentHistory,
      milestoneContext,
    },
    {
      isInvitationPhase: context.isInvitationPhase,
      isRefiningInvitation: context.isRefiningInvitation,
      isStageTransition: context.isStageTransition,
      previousStage: context.previousStage,
      isOnboarding: context.isOnboarding,
    }
  );

  /* auditLog removed - prompt will be captured in the LLM BrainActivity */

  // Step 5: Get response from Sonnet with token budget management
  const formattedContextBundle = formatContextForPrompt(contextBundle);

  // Debug: Log formatted context length and snippet
  console.log(`[AI Orchestrator] Formatted context: ${formattedContextBundle.length} chars, starts with: "${formattedContextBundle.slice(0, 100).replace(/\n/g, '\\n')}..."`);

  // Merge retrieved context with context bundle
  let fullContext = formattedContextBundle;
  if (retrievedContext) {
    const formattedRetrievedContext = formatRetrievedContext({
      ...retrievedContext,
      conversationHistory: [], // Already in context bundle
    });
    if (formattedRetrievedContext.trim()) {
      fullContext = `${formattedContextBundle}\n\n${formattedRetrievedContext}`;
    }
  }

  // Apply token budget management to avoid exceeding context limits
  const budgetedContext = buildBudgetedContext(
    systemPrompt,
    context.conversationHistory,
    fullContext
  );

  if (budgetedContext.truncated > 0) {
    console.log(
      `[AI Orchestrator] Token budget applied: included ${budgetedContext.conversationMessages.length} of ${context.conversationHistory.length} messages, ${budgetedContext.truncated} truncated`
    );
  }

  // Debug: Log the context that will be injected
  console.log(`[AI Orchestrator] Context for injection: ${budgetedContext.retrievedContext.length} chars, will inject: ${budgetedContext.retrievedContext.trim().length > 0}`);

  const messagesWithContext = buildMessagesWithContext(
    budgetedContext.conversationMessages,
    context.userMessage,
    budgetedContext.retrievedContext
  );

  let response: string;
  let usedMock = false;
  let offerFeelHeardCheck = false;
  let offerReadyToShare = false;
  let invitationMessage: string | null = null;
  let proposedEmpathyStatement: string | null = null;
  let analysis: string | undefined;

  // All stages now use semantic tag format (micro-tags: <thinking>, <draft>, <dispatch>)

  // Time to First Byte (Sonnet response generation)
  const sonnetStartTime = Date.now();
  let sonnetResponse: string | null = null;

  try {
    // Note: Extended thinking is not supported by Claude 3.5 Sonnet v2 on Bedrock
    // Disabling thinkingBudget for now to ensure real AI responses
    sonnetResponse = await getSonnetResponse({
      systemPrompt,
      messages: messagesWithContext,
      maxTokens: 4096,
      sessionId: context.sessionId,
      operation: 'orchestrator-response',
      turnId,
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
      // thinkingBudget: 1024, // Disabled - not supported on Bedrock Sonnet v2
    });

    const sonnetTime = Date.now() - sonnetStartTime;
    console.log(`[AI Orchestrator] Sonnet response generated in ${sonnetTime}ms [Time to First Byte]`);

    if (sonnetResponse) {
      // Debug: log raw response for Stage 2
      if (context.stage === 2) {
        console.log(`[AI Orchestrator] Stage 2 raw response: ${sonnetResponse.substring(0, 500)}...`);
      }

      // Parse semantic tag response (micro-tag format)
      const parsed = parseMicroTagResponse(sonnetResponse);

      // Check for dispatch (off-ramp)
      if (parsed.dispatchTag) {
        console.log(`[AI Orchestrator] Dispatch triggered: ${parsed.dispatchTag}`);

        // Build dispatch context for conversation-aware handling
        const dispatchContext: DispatchContext = {
          userMessage: context.userMessage,
          conversationHistory: context.conversationHistory,
          userName: context.userName,
          partnerName: context.partnerName,
          sessionId: context.sessionId,
          turnId: context.turnId,
        };

        const dispatchedResponse = await handleDispatch(parsed.dispatchTag, dispatchContext);

        // If AI provided an initial response along with dispatch, return both
        // This enables two-message flow: acknowledgment first, then detailed response
        if (parsed.response && parsed.response.trim()) {
          console.log(`[AI Orchestrator] Two-message dispatch flow: initial="${parsed.response.substring(0, 50)}..."`);
          return {
            response: parsed.response, // First message (AI's acknowledgment)
            memoryIntent,
            contextBundle,
            retrievalPlan,
            retrievedContext,
            usedMock: false,
            offerFeelHeardCheck: false,
            offerReadyToShare: false,
            invitationMessage: null,
            proposedEmpathyStatement: null,
            analysis: `DISPATCHED: ${parsed.dispatchTag} | Original thinking: ${parsed.thinking}`,
            initialResponse: parsed.response, // Explicit initial response
            dispatchedResponse, // Second message (handler response)
            dispatchTag: parsed.dispatchTag,
          };
        }

        // No initial response - just return the dispatched response (backward compat)
        return {
          response: dispatchedResponse,
          memoryIntent,
          contextBundle,
          retrievalPlan,
          retrievedContext,
          usedMock: false,
          offerFeelHeardCheck: false,
          offerReadyToShare: false,
          invitationMessage: null,
          proposedEmpathyStatement: null,
          analysis: `DISPATCHED: ${parsed.dispatchTag} | Original thinking: ${parsed.thinking}`,
          dispatchedResponse,
          dispatchTag: parsed.dispatchTag,
        };
      }

      // Normal response flow
      response = parsed.response;
      offerFeelHeardCheck = parsed.offerFeelHeardCheck;
      offerReadyToShare = parsed.offerReadyToShare;

      // Draft is used for both invitation (Stage 0) and empathy (Stage 2)
      if (context.isInvitationPhase || context.stage === 0) {
        invitationMessage = parsed.draft;
      } else if (context.stage === 2) {
        proposedEmpathyStatement = parsed.draft;
      }

      analysis = parsed.thinking;

      // Debug logging for Stage 2 readiness signal
      if (context.stage === 2) {
        console.log(`[AI Orchestrator] Stage 2 - Turn ${context.turnCount}, offerReadyToShare: ${offerReadyToShare}, proposedEmpathyStatement: ${proposedEmpathyStatement ? 'present' : 'null'}`);
      }

      if (parsed.thinking) {
        console.log(`[AI Orchestrator] Thinking: ${parsed.thinking.substring(0, 100)}...`);
      }
    } else {
      response = getMockResponse(context);
      usedMock = true;
    }
  } catch (error) {
    console.error('[AI Orchestrator] Sonnet response failed:', error);
    console.error('[AI Orchestrator] Sonnet response failed:', error);
    response = getMockResponse(context);
    usedMock = true;
  }

  const totalDuration = Date.now() - startTime;
  console.log(`[AI Orchestrator] Total: ${totalDuration}ms | Decision: ${decisionTime}ms | Mock: ${usedMock}`);

  // Log latency breakdown for monitoring
  if (totalDuration > 3000) {
    console.warn(`[AI Orchestrator] Slow response: ${totalDuration}ms total (Decision: ${decisionTime}ms)`);
  }

  return {
    response,
    memoryIntent,
    contextBundle,
    retrievalPlan,
    retrievedContext,
    usedMock,
    offerFeelHeardCheck,
    offerReadyToShare,
    invitationMessage,
    proposedEmpathyStatement,
    analysis,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build messages array with context injection.
 * Context is injected as a system-like prefix to the conversation.
 */
function buildMessagesWithContext(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string,
  formattedContext: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add history
  for (const msg of history) {
    messages.push(msg);
  }

  // Add current message with context prefix if we have context
  if (formattedContext.trim()) {
    messages.push({
      role: 'user',
      content: `[Context for this turn:\n${formattedContext}]\n\n${currentMessage}`,
    });
  } else {
    messages.push({
      role: 'user',
      content: currentMessage,
    });
  }

  return messages;
}

// Legacy JSON parsing functions removed - now using micro-tag parser (parseMicroTagResponse)

/**
 * Get a mock response for development without API key.
 */
function getMockResponse(context: OrchestratorContext): string {
  const { userName, turnCount, stage } = context;

  if (stage === 1) {
    if (turnCount <= 2) {
      return `Thank you for sharing that with me, ${userName}. It sounds like this has been weighing on you. I'm here to listen - can you tell me more about what you're experiencing?`;
    }
    if (turnCount <= 4) {
      return `I hear you. It sounds like there's a lot of frustration there, and that makes complete sense given what you've described. What feels most important for me to understand right now?`;
    }
    return `I really appreciate you opening up about this. What you're describing - feeling unheard and unseen - is deeply painful. I want you to know that your feelings are valid, and I'm fully present with you here.`;
  }

  if (stage === 2) {
    if (turnCount <= 2) {
      return `It sounds like you've shared a lot of what's been hurting. When you're ready, I'd love to explore something with you - not to excuse anything, just to understand. No rush.`;
    }
    return `That's a real attempt to step into their shoes. What do you imagine ${context.partnerName || 'your partner'} might be feeling underneath all of this?`;
  }

  if (stage === 3) {
    return `You've both done important work understanding each other's perspectives. Now let's explore what you each actually need here. What feels most essential to you?`;
  }

  if (stage === 4) {
    return `Looking at what you've shared, what's one small thing you'd be willing to try this week? Remember, experiments can fail - that's the point. What matters is that you're trying together.`;
  }

  return `Hello ${userName}. I'm here to help you through this conversation. What's on your mind?`;
}
