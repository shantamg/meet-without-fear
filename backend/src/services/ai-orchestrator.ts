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

import { getModelCompletion, BrainActivityCallType } from '../lib/bedrock';
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
import { buildStagePrompt, type PromptBlocks } from './stage-prompts';
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
  CONTEXT_WINDOW,
  trimConversationHistory,
} from '../utils/token-budget';
import { getSharedContentContext, getMilestoneContext } from './shared-context';
import { publishContextUpdated } from './realtime';
import { routeModel, scoreAmbiguity } from './model-router';
import { estimateContextSizes, finalizeTurnMetrics, recordContextSizes } from './llm-telemetry';
import { getFixtureResponseByIndex } from '../lib/e2e-fixtures';
import { getE2EFixtureId } from '../lib/request-context';
import type { TraceStep, TurnTrace } from '../types/turn-trace';
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
  /** Model actually used for the response */
  modelUsed?: string;
  /** Routing decision metadata */
  routingDecision?: { model: string; score: number; reasons: string[] };
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
  const traceSteps: TraceStep[] = [];
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
  traceSteps.push({
    name: 'Memory Intent',
    type: 'decision',
    startMs: decisionStartTime - startTime,
    durationMs: decisionTime,
    result: `${memoryIntent.intent} (${memoryIntent.depth})`,
    status: 'success',
  });
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
    // Stage gate: no shared content should exist for Stages 0-1 (witnessing).
    // Defense-in-depth: even if the query has user isolation, skip entirely for early stages.
    context.stage >= 2
      ? getSharedContentContext(context.sessionId, context.userId).catch((err: Error) => {
          console.warn('[AI Orchestrator] Shared content context fetch failed:', err);
          return null;
        })
      : Promise.resolve(null),
    getMilestoneContext(context.sessionId, context.userId).catch((err: Error) => {
      console.warn('[AI Orchestrator] Milestone context fetch failed:', err);
      return null;
    })
  ]);

  const parallelTime = Date.now() - parallelStartTime;
  const parallelStartMs = parallelStartTime - startTime;
  traceSteps.push(
    { name: 'Context Assembly', type: 'retrieval', startMs: parallelStartMs, durationMs: parallelTime, result: `${contextBundle.conversationContext.turnCount} turns`, status: 'success' },
    { name: 'Context Retrieval', type: 'retrieval', startMs: parallelStartMs, durationMs: parallelTime, result: retrievedContext ? retrievedContext.retrievalSummary : 'skipped', status: retrievedContext ? 'success' : 'skipped' },
    { name: 'Shared Content', type: 'retrieval', startMs: parallelStartMs, durationMs: parallelTime, result: sharedContentHistory ? 'loaded' : 'none', status: 'success' },
    { name: 'Milestones', type: 'retrieval', startMs: parallelStartMs, durationMs: parallelTime, result: milestoneContext ? 'loaded' : 'none', status: 'success' },
  );
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
  traceSteps.push({
    name: 'Surfacing Policy',
    type: 'decision',
    startMs: Date.now() - startTime,
    durationMs: 0,
    result: `shouldSurface=${surfacingDecision.shouldSurface}, style=${surfacingDecision.style}`,
    status: 'success',
  });
  console.log(`[AI Orchestrator] Surfacing decision: shouldSurface=${surfacingDecision.shouldSurface}, style=${surfacingDecision.style}`);

  // Step 3: Plan retrieval (for full depth, use Haiku)
  let retrievalPlan: RetrievalPlan | undefined;
  const shouldPlanRetrieval = memoryIntent.depth === 'full'
    && !!retrievedContext
    && (
      retrievedContext.detectedReferences.length > 0
      || retrievedContext.relevantFromOtherSessions.length > 0
      || retrievedContext.relevantFromCurrentSession.length > 0
    );

  if (shouldPlanRetrieval) {
    const retrievalPlanStart = Date.now();
    try {
      retrievalPlan = await planRetrieval(
        context.stage,
        context.userId,
        context.sessionId,
        turnId,
        context.userMessage,
        memoryIntent.intent
      );
      traceSteps.push({
        name: 'Retrieval Planning',
        type: 'llm_call',
        startMs: retrievalPlanStart - startTime,
        durationMs: Date.now() - retrievalPlanStart,
        result: `${retrievalPlan.queries.length} queries`,
        status: 'success',
      });
      console.log(`[AI Orchestrator] Retrieval planned: ${retrievalPlan.queries.length} queries`);
    } catch (error) {
      traceSteps.push({
        name: 'Retrieval Planning',
        type: 'llm_call',
        startMs: retrievalPlanStart - startTime,
        durationMs: Date.now() - retrievalPlanStart,
        result: 'failed, using mock',
        status: 'error',
      });
      console.warn('[AI Orchestrator] Retrieval planning failed, using mock plan:', error);
      retrievalPlan = getMockRetrievalPlan(context.stage, context.userId);
    }
  } else {
    traceSteps.push({
      name: 'Retrieval Planning',
      type: 'llm_call',
      startMs: Date.now() - startTime,
      durationMs: 0,
      result: 'skipped (depth != full or no context)',
      status: 'skipped',
    });
  }

  // Step 4: Build the stage-specific prompt
  // Add caution flag for high emotional intensity (8-9) - allows Sonnet to use memory
  // if it helps de-escalate, but warns to be extra careful
  const promptBuildStart = Date.now();
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

  // Combined text for token estimation (blocks are passed to bedrock separately for caching)
  const systemPromptText = `${systemPrompt.staticBlock}\n\n${systemPrompt.dynamicBlock}`;
  traceSteps.push({
    name: 'Prompt Building',
    type: 'decision',
    startMs: promptBuildStart - startTime,
    durationMs: Date.now() - promptBuildStart,
    result: `stage=${context.stage}, ${systemPromptText.length} chars`,
    status: 'success',
  });

  /* auditLog removed - prompt will be captured in the LLM BrainActivity */

  // Step 5: Get response from Sonnet with token budget management
  const formattedContextBundle = formatContextForPrompt(contextBundle, {
    sharedContentHistory,
    milestoneContext,
  });

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
  const tokenBudgetStart = Date.now();
  const summaryExists = Boolean(contextBundle.sessionSummary?.currentFocus);
  const { trimmed: trimmedHistory, truncated } = trimConversationHistory(
    context.conversationHistory,
    summaryExists ? CONTEXT_WINDOW.recentTurnsWithSummary : CONTEXT_WINDOW.recentTurnsWithoutSummary
  );

  if (truncated > 0) {
    console.log(`[AI Orchestrator] Trimmed ${truncated} old messages (summaryExists=${summaryExists})`);
  }

  const budgetedContext = buildBudgetedContext(
    systemPromptText,
    trimmedHistory,
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

  const summaryText = contextBundle.sessionSummary
    ? [
        contextBundle.sessionSummary.currentFocus,
        contextBundle.sessionSummary.keyThemes?.length
          ? `Themes: ${contextBundle.sessionSummary.keyThemes.join(', ')}`
          : '',
        contextBundle.sessionSummary.userNeeds?.length
          ? `Needs: ${contextBundle.sessionSummary.userNeeds.join('; ')}`
          : '',
        contextBundle.sessionSummary.partnerNeeds?.length
          ? `Partner needs: ${contextBundle.sessionSummary.partnerNeeds.join('; ')}`
          : '',
      ]
        .filter((line) => line.trim().length > 0)
        .join('\n')
    : '';

  recordContextSizes(context.turnId, estimateContextSizes({
    pinned: systemPromptText,
    summary: summaryText,
    recentMessages: budgetedContext.conversationMessages,
    rag: budgetedContext.retrievedContext,
  }));

  traceSteps.push({
    name: 'Token Budget',
    type: 'decision',
    startMs: tokenBudgetStart - startTime,
    durationMs: Date.now() - tokenBudgetStart,
    result: `${budgetedContext.conversationMessages.length} msgs, ${budgetedContext.truncated} truncated`,
    status: 'success',
  });

  let response: string;
  let usedMock = false;
  let offerFeelHeardCheck = false;
  let offerReadyToShare = false;
  let invitationMessage: string | null = null;
  let proposedEmpathyStatement: string | null = null;
  let analysis: string | undefined;

  // All stages now use semantic tag format (micro-tags: <thinking>, <draft>, <dispatch>)

  const routingDecision = routeModel({
    requestType: context.isInvitationPhase || context.stage === 0 ? 'draft' : 'mediate',
    conflictIntensity: context.emotionalIntensity,
    ambiguityScore: scoreAmbiguity(context.userMessage),
    messageLength: context.userMessage.length,
  });
  traceSteps.push({
    name: 'Model Routing',
    type: 'decision',
    startMs: Date.now() - startTime,
    durationMs: 0,
    result: `model=${routingDecision.model}, score=${routingDecision.score}`,
    status: 'success',
  });
  console.log(`[AI Orchestrator] Routing decision: model=${routingDecision.model}, score=${routingDecision.score}, reasons=${routingDecision.reasons.join(',')}`);

  // Time to First Byte (response generation)
  const responseStartTime = Date.now();
  let modelResponse: string | null = null;

  try {
    // Note: Extended thinking is not supported by Claude 3.5 Sonnet v2 on Bedrock
    // Disabling thinkingBudget for now to ensure real AI responses
    modelResponse = await getModelCompletion(routingDecision.model, {
      systemPrompt,
      messages: messagesWithContext,
      maxTokens: routingDecision.model === 'haiku' ? 1536 : 2048,
      sessionId: context.sessionId,
      operation: `orchestrator-response-${routingDecision.model}`,
      turnId,
      callType: BrainActivityCallType.ORCHESTRATED_RESPONSE,
      // thinkingBudget: 1024, // Disabled - not supported on Bedrock Sonnet v2
    });

    const responseTime = Date.now() - responseStartTime;
    traceSteps.push({
      name: 'LLM Call',
      type: 'llm_call',
      startMs: responseStartTime - startTime,
      durationMs: responseTime,
      result: modelResponse ? `${routingDecision.model}, ${modelResponse.length} chars` : 'null response',
      status: modelResponse ? 'success' : 'error',
    });
    console.log(`[AI Orchestrator] Response generated in ${responseTime}ms [Time to First Byte]`);

    if (modelResponse) {
      // Debug: log raw response for Stage 2
      if (context.stage === 2) {
        console.log(`[AI Orchestrator] Stage 2 raw response: ${modelResponse.substring(0, 500)}...`);
      }

      // Parse semantic tag response (micro-tag format)
      const parseStart = Date.now();
      const parsed = parseMicroTagResponse(modelResponse);
      traceSteps.push({
        name: 'Response Parsing',
        type: 'parsing',
        startMs: parseStart - startTime,
        durationMs: Date.now() - parseStart,
        result: `thinking=${!!parsed.thinking}, draft=${!!parsed.draft}, dispatch=${parsed.dispatchTag || 'none'}`,
        status: 'success',
      });

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

        const dispatchStart = Date.now();
        const dispatchedResponse = await handleDispatch(parsed.dispatchTag, dispatchContext);

        // If dispatch handler returned null (unknown tag), fall through to normal response flow
        if (dispatchedResponse === null) {
          console.log(`[AI Orchestrator] Unknown dispatch tag "${parsed.dispatchTag}" — using original AI response`);
          traceSteps.push({
            name: `Dispatch (ignored): ${parsed.dispatchTag}`,
            type: 'dispatch',
            startMs: dispatchStart - startTime,
            durationMs: Date.now() - dispatchStart,
            result: 'Unknown tag — fell through to normal response',
            status: 'skipped',
          });
          // Fall through to normal response flow below
        } else {
          traceSteps.push({
            name: `Dispatch: ${parsed.dispatchTag}`,
            type: 'dispatch',
            startMs: dispatchStart - startTime,
            durationMs: Date.now() - dispatchStart,
            result: `${dispatchedResponse.length} chars`,
            status: 'success',
          });

          const totalDuration = Date.now() - startTime;
          const turnTrace: TurnTrace = { totalDurationMs: totalDuration, modelUsed: routingDecision.model, usedMock: false, steps: traceSteps };

          // If AI provided an initial response along with dispatch, return both
          // This enables two-message flow: acknowledgment first, then detailed response
          if (parsed.response && parsed.response.trim()) {
            console.log(`[AI Orchestrator] Two-message dispatch flow: initial="${parsed.response.substring(0, 50)}..."`);
            finalizeTurnMetrics(context.turnId);
            // Store trace on the ORCHESTRATED_RESPONSE activity via brain service
            storeTurnTrace(context.sessionId, turnId, turnTrace);
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
              modelUsed: routingDecision.model,
              routingDecision,
            };
          }

          // No initial response - just return the dispatched response (backward compat)
          finalizeTurnMetrics(context.turnId);
          storeTurnTrace(context.sessionId, turnId, turnTrace);
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
            modelUsed: routingDecision.model,
            routingDecision,
          };
        }
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
    traceSteps.push({
      name: 'LLM Call',
      type: 'llm_call',
      startMs: responseStartTime - startTime,
      durationMs: Date.now() - responseStartTime,
      result: String(error),
      status: 'error',
    });
    console.error('[AI Orchestrator] Response generation failed:', error);
    response = getMockResponse(context);
    usedMock = true;
  }

  const totalDuration = Date.now() - startTime;
  console.log(`[AI Orchestrator] Total: ${totalDuration}ms | Decision: ${decisionTime}ms | Mock: ${usedMock}`);
  finalizeTurnMetrics(context.turnId);

  // Store turn trace on the ORCHESTRATED_RESPONSE activity
  const turnTrace: TurnTrace = { totalDurationMs: totalDuration, modelUsed: routingDecision.model, usedMock, steps: traceSteps };
  storeTurnTrace(context.sessionId, turnId, turnTrace);

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
    modelUsed: routingDecision.model,
    routingDecision,
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
      content: `Context:\n${formattedContext}\n\nUser message: ${currentMessage}`,
    });
  } else {
    messages.push({
      role: 'user',
      content: currentMessage,
    });
  }

  return messages;
}

/**
 * Store turn trace on the ORCHESTRATED_RESPONSE BrainActivity for this turn.
 * Merges turnTrace into the activity's metadata (fire-and-forget).
 */
function storeTurnTrace(sessionId: string, turnId: string, turnTrace: TurnTrace): void {
  prisma.brainActivity.findFirst({
    where: {
      sessionId,
      turnId,
      callType: 'ORCHESTRATED_RESPONSE',
    },
    orderBy: { createdAt: 'desc' },
  }).then(async (activity) => {
    if (!activity) return;
    const existingMeta = (activity.metadata as Record<string, unknown>) || {};
    await prisma.brainActivity.update({
      where: { id: activity.id },
      data: {
        metadata: { ...existingMeta, turnTrace: JSON.parse(JSON.stringify(turnTrace)) },
      },
    });
  }).catch((err) => {
    console.warn('[AI Orchestrator] Failed to store turn trace:', err);
  });
}

// Legacy JSON parsing functions removed - now using micro-tag parser (parseMicroTagResponse)

/**
 * Get a mock response for development without API key.
 * When E2E_FIXTURE_ID is set, loads response from fixture file.
 *
 * NOTE: Fixture responses contain <thinking> tags just like real AI responses.
 * We parse them here to extract the clean response, matching the behavior
 * of the main response flow (which uses parseMicroTagResponse).
 */
function getMockResponse(context: OrchestratorContext): string {
  const fixtureId = getE2EFixtureId();

  // Use fixture response if fixture ID is available
  if (fixtureId) {
    try {
      // Response index = number of user messages sent (turnCount is 1-based, so use turnCount - 1)
      // We subtract 1 because fixture indices are 0-based
      const responseIndex = Math.max(0, context.turnCount - 1);
      console.log(`[AI Orchestrator] Using fixture ${fixtureId}, index ${responseIndex}`);
      const rawFixture = getFixtureResponseByIndex(fixtureId, responseIndex);

      // Parse the fixture response to strip <thinking> tags, just like real AI responses
      const parsed = parseMicroTagResponse(rawFixture);
      return parsed.response || rawFixture; // Fallback to raw if parsing fails
    } catch (error) {
      console.warn(`[AI Orchestrator] Fixture response failed, falling back to default mock:`, error);
      // Fall through to default mock response
    }
  }

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
