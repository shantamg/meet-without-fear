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

import { getSonnetResponse } from '../lib/bedrock';
import { prisma } from '../lib/prisma';
import {
  determineMemoryIntent,
  type MemoryIntentContext,
  type MemoryIntentResult,
} from './memory-intent';
import { detectMemoryIntent } from './memory-detector';
import { validateMemory } from './memory-validator';
import type { MemorySuggestion } from '@meet-without-fear/shared';
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
import { auditLog } from './audit-logger';
import { extractJsonFromResponse } from '../utils/json-extractor';
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
import { publishUserEvent } from './realtime';
import { memoryService } from './memory-service';

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
  auditLog('USER', 'User message received', {
    turnId,
    sessionId: context.sessionId,
    userId: context.userId,
    userName: context.userName,
    stage: context.stage,
    turnCount: context.turnCount,
    userMessage: context.userMessage,
    messageLength: context.userMessage.length,
    isFirstTurnInSession: context.isFirstTurnInSession,
  });

  // Step 0: Fetch user preferences
  const userPrefs = await getUserMemoryPreferences(context.userId);

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
  auditLog('INTENT', 'Memory intent determined', {
    turnId,
    sessionId: context.sessionId,
    intent: memoryIntent.intent,
    depth: memoryIntent.depth,
    reason: memoryIntent.reason,
    userInput: context.userMessage,
    emotionalIntensity: context.emotionalIntensity,
    turnCount: context.turnCount,
  });

  if (decisionTime > 1000) {
    console.warn(`[AI Orchestrator] Decision layer took ${decisionTime}ms (>1s) - consider optimization`);
  }

  // Step 1.5: Memory Detection (synchronous, before response generation)
  // Detect memory intents and validate them. If invalid, we'll pass the rejection reason
  // to Sonnet so it can address the request therapeutically in the response.
  const recentMessagesForMemory = context.conversationHistory.slice(-5);
  let memoryDetectionResult: { suggestion?: MemorySuggestion; validation?: { valid: boolean; reason?: string } } | null = null;
  
  try {
    const detectionResult = await detectMemoryIntent(
      context.userMessage,
      context.sessionId,
      turnId,
      'partner-session',
      recentMessagesForMemory
    );

    if (detectionResult.hasMemoryIntent && detectionResult.suggestions.length > 0) {
      // Validate the first suggestion synchronously before showing to user
      const suggestion = detectionResult.suggestions[0];

      try {
        // Validate BEFORE generating response - only show valid suggestions to user
        const validation = await validateMemory(
          suggestion.suggestedContent,
          suggestion.category,
          { sessionId: context.sessionId, turnId, useAI: true }
        );

        console.log('[AI Orchestrator] Memory validation result:', {
          content: suggestion.suggestedContent,
          category: suggestion.category,
          valid: validation.valid,
          reason: validation.reason,
        });

        if (validation.valid) {
          auditLog('MEMORY_DETECTION', 'Memory suggestion detected', {
            turnId,
            sessionId: context.sessionId,
            content: suggestion.suggestedContent,
            category: suggestion.category,
            confidence: suggestion.confidence,
            evidence: suggestion.evidence,
            validation: 'valid',
          });

          // Persist as PENDING (always global, no sessionId)
          const memory = await memoryService.createPendingMemory({
            userId: context.userId,
            content: suggestion.suggestedContent,
            category: suggestion.category,
            suggestedBy: `AI Confidence: ${suggestion.confidence} | Evidence: ${suggestion.evidence}`,
          });

          // Send memory suggestion to the SPECIFIC USER who made the statement
          // (not broadcast to all session members - this is a personal memory offer)
          await publishUserEvent(
            context.userId,
            'memory.suggested',
            {
              sessionId: context.sessionId,
              suggestion: {
                id: memory.id,
                suggestedContent: suggestion.suggestedContent,
                category: suggestion.category,
                confidence: suggestion.confidence,
                evidence: suggestion.evidence,
                validation: 'valid',
              },
            }
          );

          memoryDetectionResult = {
            suggestion,
            validation: { valid: true },
          };
        } else {
          // Invalid memory request - log it but don't show to user
          auditLog('MEMORY_DETECTION', 'Memory suggestion rejected', {
            turnId,
            sessionId: context.sessionId,
            content: suggestion.suggestedContent,
            category: suggestion.category,
            confidence: suggestion.confidence,
            evidence: suggestion.evidence,
            validation: 'invalid',
            rejectionReason: validation.reason,
          });

          memoryDetectionResult = {
            suggestion,
            validation: { valid: false, reason: validation.reason },
          };
        }
      } catch (error) {
        console.warn('[AI Orchestrator] Memory validation failed:', error);
        // If validation fails, don't show to user (safer to skip than show invalid)
        auditLog('MEMORY_DETECTION', 'Memory suggestion skipped (validation error)', {
          turnId,
          sessionId: context.sessionId,
          content: suggestion.suggestedContent,
          category: suggestion.category,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } catch (error) {
    console.warn('[AI Orchestrator] Memory detection failed:', error);
    // Continue without memory detection - don't block the response
  }

  // Step 2: Assemble context bundle
  const contextBundle = await assembleContextBundle(
    context.sessionId,
    context.userId,
    context.stage,
    memoryIntent
  );
  console.log(
    `[AI Orchestrator] Context assembled: ${contextBundle.conversationContext.turnCount} turns`
  );
  auditLog('RETRIEVAL', 'Context bundle assembled', {
    turnId,
    sessionId: context.sessionId,
    stage: context.stage,
    turnCount: contextBundle.conversationContext.turnCount,
  });

  // Step 2.5: Universal context retrieval
  // This ensures awareness of relevant content from other sessions or earlier history
  // Uses stage-aware thresholds from memory intent
  let retrievedContext: RetrievedContext | undefined;
  try {
    retrievedContext = await retrieveContext({
      userId: context.userId,
      currentMessage: context.userMessage,
      currentSessionId: context.sessionId,
      turnId,
      includePreSession: true,
      // Use stage-aware config from memory intent
      maxCrossSessionMessages: memoryIntent.maxCrossSession,
      similarityThreshold: memoryIntent.threshold,
      memoryIntent,
      userPreferences: userPrefs,
    });
    console.log(
      `[AI Orchestrator] Context retrieved: ${retrievedContext.retrievalSummary}`
    );
    auditLog('RETRIEVAL', 'Context retrieved', {
      turnId,
      sessionId: context.sessionId,
      stage: context.stage,
      summary: retrievedContext.retrievalSummary,
      conversationHistoryCount: retrievedContext.conversationHistory.length,
      crossSessionCount: retrievedContext.relevantFromOtherSessions.length,
      withinSessionCount: retrievedContext.relevantFromCurrentSession.length,
      preSessionCount: retrievedContext.preSessionMessages.length,
      referencesDetected: retrievedContext.detectedReferences.length,
      // Include sample of retrieved messages (first 3 of each type)
      crossSessionSamples: retrievedContext.relevantFromOtherSessions.slice(0, 3).map(m => ({
        content: m.content.substring(0, 200),
        similarity: m.similarity.toFixed(3),
        timeContext: m.timeContext,
      })),
      withinSessionSamples: retrievedContext.relevantFromCurrentSession.slice(0, 3).map(m => ({
        content: m.content.substring(0, 200),
        similarity: m.similarity.toFixed(3),
        timeContext: m.timeContext,
      })),
    });
  } catch (error) {
    console.warn('[AI Orchestrator] Context retrieval failed, continuing without:', error);
    auditLog('ERROR', 'Context retrieval failed', {
      turnId,
      sessionId: context.sessionId,
      stage: context.stage,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Step 2.6: Apply surfacing policy
  // Determine how/whether to surface pattern observations
  // TODO: Get lastSurfacingTurn from session metadata (for now, undefined = no cooldown check)
  const surfacingDecision = decideSurfacing(
    context.stage,
    context.turnCount,
    userAskedForPattern(context.userMessage),
    userPrefs.patternInsights,
    countPatternEvidence(retrievedContext ?? null),
    undefined // lastSurfacingTurn - TODO: fetch from session metadata
  );
  console.log(
    `[AI Orchestrator] Surfacing decision: shouldSurface=${surfacingDecision.shouldSurface}, style=${surfacingDecision.style}`
  );

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
      console.log(
        `[AI Orchestrator] Retrieval planned: ${retrievalPlan.queries.length} queries`
      );
      auditLog('RETRIEVAL', 'Retrieval plan created', {
        turnId,
        sessionId: context.sessionId,
        stage: context.stage,
        queryCount: retrievalPlan.queries.length,
        queries: retrievalPlan.queries.map(q => ({
          type: q.type,
          source: q.source,
        })),
      });
    } catch (error) {
      console.warn('[AI Orchestrator] Retrieval planning failed, using mock plan:', error);
      retrievalPlan = getMockRetrievalPlan(context.stage, context.userId);
      auditLog('ERROR', 'Retrieval planning failed, using mock plan', {
        turnId,
        sessionId: context.sessionId,
        stage: context.stage,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
      invalidMemoryRequest: memoryDetectionResult?.validation && !memoryDetectionResult.validation.valid && memoryDetectionResult.suggestion
        ? {
            requestedContent: memoryDetectionResult.suggestion.suggestedContent,
            rejectionReason: memoryDetectionResult.validation.reason || 'This request conflicts with our therapeutic approach.',
          }
        : undefined,
    },
    {
      isInvitationPhase: context.isInvitationPhase,
      isRefiningInvitation: context.isRefiningInvitation,
      isStageTransition: context.isStageTransition,
      previousStage: context.previousStage,
      isOnboarding: context.isOnboarding,
    }
  );

  // Log the prompt being sent
  auditLog('PROMPT', 'System prompt assembled', {
    turnId,
    sessionId: context.sessionId,
    stage: context.stage,
    promptLength: systemPrompt.length,
    promptPreview: systemPrompt.substring(0, 500) + (systemPrompt.length > 500 ? '...' : ''),
    fullPrompt: systemPrompt, // Include full prompt for expandable view
    turnCount: context.turnCount,
    cautionAdvised,
  });

  // Step 5: Get response from Sonnet with token budget management
  const formattedContextBundle = formatContextForPrompt(contextBundle);

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

  // Log the context that will be inserted into the prompt
  auditLog('PROMPT', 'Context injected into conversation', {
    turnId,
    sessionId: context.sessionId,
    contextBundlePreview: formattedContextBundle.substring(0, 300) + (formattedContextBundle.length > 300 ? '...' : ''),
    fullContextBundle: formattedContextBundle,
    retrievedContextPreview: retrievedContext ? formatRetrievedContext({
      ...retrievedContext,
      conversationHistory: [],
    }).substring(0, 300) + (formatRetrievedContext({
      ...retrievedContext,
      conversationHistory: [],
    }).length > 300 ? '...' : '') : null,
    fullRetrievedContext: retrievedContext ? formatRetrievedContext({
      ...retrievedContext,
      conversationHistory: [],
    }) : null,
    conversationHistoryCount: budgetedContext.conversationMessages.length,
    truncatedCount: budgetedContext.truncated,
  });

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

  // Determine if we should expect structured JSON output
  // All stages use structured JSON format in their prompts
  const expectsStructuredOutput = true;

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
      // thinkingBudget: 1024, // Disabled - not supported on Bedrock Sonnet v2
    });

    const sonnetTime = Date.now() - sonnetStartTime;
    console.log(`[AI Orchestrator] Sonnet response generated in ${sonnetTime}ms [Time to First Byte]`);
    auditLog('RESPONSE', 'Sonnet response generated', {
      turnId,
      sessionId: context.sessionId,
      durationMs: sonnetTime,
      stage: context.stage,
      responseLength: sonnetResponse?.length || 0,
      responsePreview: sonnetResponse?.substring(0, 300) || '',
      responseText: sonnetResponse || '',
    });

    if (sonnetResponse) {
      if (expectsStructuredOutput) {
        // Debug: log raw response for Stage 2
        if (context.stage === 2) {
          console.log(`[AI Orchestrator] Stage 2 raw response: ${sonnetResponse.substring(0, 500)}...`);
        }

        // Parse structured JSON response
        const parsed = parseStructuredResponse(sonnetResponse);
        response = parsed.response;
        offerFeelHeardCheck = parsed.offerFeelHeardCheck ?? false;
        offerReadyToShare = parsed.offerReadyToShare ?? false;
        invitationMessage = parsed.invitationMessage ?? null;
        proposedEmpathyStatement = parsed.proposedEmpathyStatement ?? null;
        analysis = parsed.analysis;

        // Debug logging for Stage 2 readiness signal
        if (context.stage === 2) {
          console.log(`[AI Orchestrator] Stage 2 - Turn ${context.turnCount}, offerReadyToShare: ${offerReadyToShare}, proposedEmpathyStatement: ${proposedEmpathyStatement ? 'present' : 'null'}`);
        }

        if (parsed.analysis) {
          console.log(`[AI Orchestrator] Analysis: ${parsed.analysis.substring(0, 100)}...`);
        }
      } else {
        // Strip analysis tags for non-structured stages
        response = stripAnalysisTags(sonnetResponse);
      }
    } else {
      response = getMockResponse(context);
      usedMock = true;
    }
  } catch (error) {
    console.error('[AI Orchestrator] Sonnet response failed:', error);
    auditLog('ERROR', 'Sonnet response failed', {
      turnId,
      sessionId: context.sessionId,
      stage: context.stage,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    response = getMockResponse(context);
    usedMock = true;
  }

  const totalDuration = Date.now() - startTime;
  console.log(`[AI Orchestrator] Total: ${totalDuration}ms | Decision: ${decisionTime}ms | Mock: ${usedMock}`);
  auditLog('RESPONSE', 'AI response completed', {
    turnId,
    sessionId: context.sessionId,
    stage: context.stage,
    usedMock,
    totalDuration,
    responseLength: response.length,
    responseText: sonnetResponse || response, // Use raw full text if available so dashboard can parse structure
    offerFeelHeardCheck,
    offerReadyToShare,
    invitationMessage, // Include actual values, not just booleans
    proposedEmpathyStatement,
    analysis,
  });

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

/**
 * Strip <analysis> tags from AI response.
 */
function stripAnalysisTags(response: string): string {
  const stripped = response.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
  return stripped || response;
}

/**
 * Parsed structured response from AI (for Stage 0, Stage 1, and Stage 2)
 */
interface ParsedStructuredResponse {
  response: string;
  offerFeelHeardCheck?: boolean;
  offerReadyToShare?: boolean;
  invitationMessage?: string | null;
  proposedEmpathyStatement?: string | null;
  analysis?: string;
}

/**
 * Parse structured JSON response from AI.
 * Handles Stage 0 (invitation), Stage 1 (witness with offerFeelHeardCheck), and Stage 2 (perspective with offerReadyToShare).
 * Uses the robust extractJsonFromResponse utility.
 */
function parseStructuredResponse(rawResponse: string): ParsedStructuredResponse {
  // Extract external <analysis> tags first (as they are outside the JSON)
  const analysisMatch = rawResponse.match(/<analysis>([\s\S]*?)<\/analysis>/i);
  const externalAnalysis = analysisMatch ? analysisMatch[1].trim() : undefined;

  try {
    const parsed = extractJsonFromResponse(rawResponse) as Record<string, unknown>;

    // Validate we have a response field
    if (typeof parsed.response !== 'string') {
      console.warn('[AI Orchestrator] Parsed JSON missing response field, attempting direct extraction');
      const fallback = extractResponseFallback(rawResponse);
      return { ...fallback, analysis: externalAnalysis };
    }

    return {
      response: parsed.response,
      offerFeelHeardCheck: typeof parsed.offerFeelHeardCheck === 'boolean' ? parsed.offerFeelHeardCheck : false,
      offerReadyToShare: typeof parsed.offerReadyToShare === 'boolean' ? parsed.offerReadyToShare : false,
      invitationMessage: typeof parsed.invitationMessage === 'string' && parsed.invitationMessage !== 'null'
        ? parsed.invitationMessage
        : null,
      proposedEmpathyStatement: typeof parsed.proposedEmpathyStatement === 'string' && parsed.proposedEmpathyStatement !== 'null'
        ? parsed.proposedEmpathyStatement
        : null,
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : externalAnalysis,
    };
  } catch (error) {
    // Fallback: try direct extraction methods
    console.log('[AI Orchestrator] JSON extraction failed, trying fallback:', error);
    const fallback = extractResponseFallback(rawResponse);
    return { ...fallback, analysis: externalAnalysis };
  }
}

/**
 * Fallback extraction when normal JSON parsing fails.
 * Tries multiple strategies to avoid returning raw JSON to the user.
 */
function extractResponseFallback(rawResponse: string): ParsedStructuredResponse {
  // Strategy 1: Try to find "response": "..." pattern directly using regex
  // This handles cases where the JSON structure is broken but the response field exists
  const responseMatch = rawResponse.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (responseMatch) {
    // Unescape the extracted string
    const extracted = responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    console.log('[AI Orchestrator] Extracted response via regex fallback');
    return {
      response: extracted,
      offerFeelHeardCheck: false,
      offerReadyToShare: false,
      invitationMessage: null,
      proposedEmpathyStatement: null,
    };
  }

  // Strategy 2: Strip analysis tags and check if result looks like JSON
  const strippedResponse = stripAnalysisTags(rawResponse);

  // If the stripped response looks like JSON, use a generic fallback
  // This prevents raw JSON from being shown to the user
  if (strippedResponse.trim().startsWith('{') || strippedResponse.trim().startsWith('[')) {
    console.warn('[AI Orchestrator] Response looks like JSON after fallback, using generic message');
    return {
      response: "I understand. Can you tell me more about what you're experiencing?",
      offerFeelHeardCheck: false,
      offerReadyToShare: false,
      invitationMessage: null,
      proposedEmpathyStatement: null,
    };
  }

  // Strategy 3: The stripped response is plain text, use it
  return {
    response: strippedResponse,
    offerFeelHeardCheck: false,
    offerReadyToShare: false,
    invitationMessage: null,
    proposedEmpathyStatement: null,
  };
}

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
