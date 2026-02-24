/**
 * Empathy Reconciler Service
 *
 * Analyzes the gap between what one person guessed about the other's feelings
 * vs what they actually expressed. This runs ASYMMETRICALLY - when User A
 * submits their empathy statement about User B, the reconciler runs as soon as
 * User B completes Stage 1 (not waiting for User B to submit empathy).
 *
 * Flow:
 * 1. User A completes Stage 2 (shares empathy statement about User B) → status = HELD
 * 2. User B completes Stage 1 (confirms "I feel heard") → triggers reconciler for A→B direction
 * 3. Reconciler compares A's empathy guess vs B's actual witnessing content
 * 4. If gaps exist:
 *    a. Generate a suggestion for B to share with A (status = AWAITING_SHARING)
 *    b. B can accept, refine, or decline
 *    c. If B shares, A receives the context and can refine their empathy (status = REFINING)
 * 5. Once A's empathy is approved (or B declines to share), A's empathy is REVEALED to B
 */

import { prisma } from '../lib/prisma';
import { MessageRole } from '@meet-without-fear/shared';
import { getSonnetResponse, getHaikuJson } from '../lib/bedrock';
import { BrainActivityCallType } from '@prisma/client';
import { publishMessageAIResponse } from './realtime';
import { getCurrentUserId } from '../lib/request-context';
import {
  buildReconcilerPrompt,
  buildShareOfferPrompt,
  buildReconcilerSummaryPrompt,
  buildStagePrompt,
  type ReconcilerContext,
  type ShareOfferContext,
  type ReconcilerSummaryContext,
  type PromptContext,
} from './stage-prompts';
import type { ContextBundle } from './context-assembler';
import { extractJsonFromResponse } from '../utils/json-extractor';
import type {
  ReconcilerResult,
  ShareOfferMessage,
  ReconcilerSummary,
} from '@meet-without-fear/shared';

// ============================================================================
// Circuit Breaker: Check and increment refinement attempts
// ============================================================================

/**
 * Check and increment the refinement attempt counter for a specific direction.
 * Returns whether the reconciler should be skipped (circuit breaker tripped).
 *
 * The circuit breaker prevents infinite refinement loops by limiting attempts to 3 per direction.
 * On the 4th attempt, shouldSkipReconciler=true is returned.
 *
 * @param sessionId - The session ID
 * @param guesserId - The user who made the empathy guess
 * @param subjectId - The user being guessed about
 * @returns Object with shouldSkipReconciler (true if >= 4 attempts) and current attempts count
 */
/**
 * Check the current attempt count for a direction (read-only).
 * Used by runReconcilerForDirection to enforce the circuit breaker limit.
 */
export async function checkAttempts(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<{ shouldSkipReconciler: boolean; attempts: number }> {
  const direction = `${guesserId}->${subjectId}`;

  const counter = await prisma.refinementAttemptCounter.findUnique({
    where: { sessionId_direction: { sessionId, direction } },
  });

  const attempts = counter?.attempts ?? 0;
  const shouldSkipReconciler = attempts > 3;

  console.log(
    `[CircuitBreaker] Direction ${direction}: attempt ${attempts}/3, shouldSkip=${shouldSkipReconciler}`
  );

  return { shouldSkipReconciler, attempts };
}

/**
 * Increment the attempt counter for a direction (write-only).
 * Called ONLY from resubmitEmpathy code paths, NOT from initial reconciler runs.
 */
export async function incrementAttempts(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<void> {
  const direction = `${guesserId}->${subjectId}`;

  await prisma.refinementAttemptCounter.upsert({
    where: { sessionId_direction: { sessionId, direction } },
    create: { sessionId, direction, attempts: 1 },
    update: { attempts: { increment: 1 } },
  });

  console.log(`[CircuitBreaker] Direction ${direction}: incremented attempt counter`);
}

// ============================================================================
// Helper: Check if context has already been shared for a direction
// ============================================================================

/**
 * Check if SHARED_CONTEXT has already been sent from subject to guesser.
 *
 * This prevents the reconciler loop where:
 * 1. Reconciler finds gaps → sets status to AWAITING_SHARING
 * 2. User shares context → SHARED_CONTEXT message created
 * 3. User resubmits empathy → ReconcilerResult deleted (cascades to ReconcilerShareOffer)
 * 4. Reconciler runs again → finds same gaps → sets AWAITING_SHARING again
 * 5. Loop repeats indefinitely
 *
 * By checking for existing SHARED_CONTEXT messages, we can skip the sharing step
 * if context has already been shared for this direction.
 *
 * @param sessionId - The session ID
 * @param guesserId - The guesser (person whose empathy has gaps)
 * @param subjectId - The subject (person who should share context)
 * @returns true if context has already been shared for this direction
 */
export async function hasContextAlreadyBeenShared(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<boolean> {
  // SHARED_CONTEXT messages have:
  // - senderId = subject (person who shared)
  // - forUserId = guesser (person who receives the context)
  const existingSharedContext = await prisma.message.findFirst({
    where: {
      sessionId,
      role: 'SHARED_CONTEXT',
      senderId: subjectId,
      forUserId: guesserId,
    },
  });

  if (existingSharedContext) {
    console.log(
      `[hasContextAlreadyBeenShared] Context already shared from ${subjectId} to ${guesserId} at ${existingSharedContext.timestamp.toISOString()}`
    );
    return true;
  }

  return false;
}

// ============================================================================
// Helper: Find ReconcilerResult with retry
// ============================================================================

/**
 * Retry up to 3 times to find ReconcilerResult to handle potential race condition
 * where the record might not be immediately visible after creation.
 * This is only used as a fallback when the DB record is not passed by reference.
 */
async function findReconcilerResultWithRetry(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<any | null> {
  let dbResult = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[Reconciler] Looking up ReconcilerResult (attempt ${attempt}/3) for guesser=${guesserId}, subject=${subjectId}`);
    dbResult = await prisma.reconcilerResult.findFirst({
      where: {
        sessionId,
        guesserId,
        subjectId,
        supersededAt: null,
      },
    });
    if (dbResult) {
      break;
    }
    if (attempt < 3) {
      console.warn(`[Reconciler] ReconcilerResult not found on attempt ${attempt}, waiting 100ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  if (!dbResult) {
    console.error(`[Reconciler] CRITICAL: Could not find reconcilerResult after 3 attempts! guesser=${guesserId}, subject=${subjectId}, sessionId=${sessionId}`);
  }

  return dbResult;
}

// ============================================================================
// Helper: Mark empathy as READY
// ============================================================================

/**
 * Mark guesser's empathy attempt as READY, create alignment message, and check reveal.
 * This helper extracts the common logic when no sharing is needed.
 *
 * @param circuitBreakerTripped - If true, uses a natural transition message instead of accuracy feedback
 */
async function markEmpathyReady(
  sessionId: string,
  guesserId: string,
  subjectName: string,
  circuitBreakerTripped = false
): Promise<void> {
  console.log(`[Reconciler] Marking empathy as READY for guesser ${guesserId}`);

  // Update empathy attempt status to READY
  await prisma.empathyAttempt.updateMany({
    where: { sessionId, sourceUserId: guesserId },
    data: { status: 'READY', statusVersion: { increment: 1 } },
  });

  // Choose message based on whether circuit breaker tripped
  const alignmentMessage = circuitBreakerTripped
    ? `You've shared your perspective on what ${subjectName} might be experiencing. Let's move forward — ${subjectName} is also reflecting on your perspective.`
    : `${subjectName} has felt heard. The reconciler reports your attempt to imagine what they're feeling was quite accurate. ${subjectName} is now considering your perspective, and once they do, you'll both see what each other shared.`;

  const savedMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: null, // AI message
      forUserId: guesserId,
      role: 'AI',
      content: alignmentMessage,
      stage: 2,
    },
  });

  console.log(`[Reconciler] Created alignment message for guesser ${guesserId}: "${alignmentMessage}"`);

  // Publish the message via Ably so guesser sees it immediately
  await publishMessageAIResponse(
    sessionId,
    guesserId,
    {
      id: savedMessage.id,
      sessionId,
      senderId: null,
      content: savedMessage.content,
      timestamp: savedMessage.timestamp.toISOString(),
      role: MessageRole.AI,
      stage: savedMessage.stage,
    },
    {} // No metadata needed
  );

  // Check if both directions are now READY and reveal both if so
  await checkAndRevealBothIfReady(sessionId);
}

// ============================================================================
// Helper: Get Sonnet JSON response
// ============================================================================

/**
 * Get a JSON response from Sonnet, parsing the result.
 */
async function getSonnetJson<T>(options: {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  sessionId?: string;
  operation?: string;
  turnId?: string;
}): Promise<T | null> {
  // Ensure sessionId, turnId, and operation are always strings
  const effectiveSessionId = options.sessionId || 'reconciler';
  const effectiveTurnId = options.turnId || (options.sessionId ? `${options.sessionId}-${Date.now()}` : `reconciler-${Date.now()}`);
  const effectiveOperation = options.operation || 'reconciler';

  console.log(`[Reconciler:getSonnetJson] Starting AI request for operation: ${effectiveOperation}`);

  const response = await getSonnetResponse({
    ...options,
    sessionId: effectiveSessionId,
    turnId: effectiveTurnId,
    operation: effectiveOperation,
    callType: BrainActivityCallType.RECONCILER_ANALYSIS,
  });

  if (!response) {
    console.warn(`[Reconciler:getSonnetJson] No response received for operation: ${effectiveOperation}`);
    return null;
  }

  try {
    const json = extractJsonFromResponse(response) as T;
    console.log(`[Reconciler:getSonnetJson] Successfully parsed JSON for operation: ${effectiveOperation}`);
    return json;
  } catch (error) {
    console.warn(`[Reconciler:getSonnetJson] Failed to parse JSON response for operation: ${effectiveOperation}`, error);
    console.log(`[Reconciler:getSonnetJson] Raw response: ${response}`);
    return null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface UserInfo {
  id: string;
  name: string;
}

interface SessionParticipants {
  userA: UserInfo;
  userB: UserInfo;
}

interface WitnessingContent {
  /** Combined user messages from Stage 1 */
  userMessages: string;
  /** Key themes/feelings extracted */
  themes: string[];
}

interface EmpathyData {
  /** The empathy statement they shared */
  statement: string;
  /** When it was shared */
  sharedAt: Date;
}

interface ReconcilerAnalysisInput {
  sessionId: string;
  guesser: UserInfo;
  subject: UserInfo;
  empathyStatement: string;
  witnessingContent: WitnessingContent;
}

// ============================================================================
// Helper: Generate Post-Share Continuation
// ============================================================================

/**
 * Generate a stage-appropriate continuation message after a user shares context.
 * Uses the actual stage prompts with justSharedWithPartner context for consistency.
 * The stage prompt handles acknowledging the share and continuing appropriately.
 */
async function generatePostShareContinuation(
  sessionId: string,
  subjectId: string,
  subjectName: string,
  partnerName: string,
  sharedContent: string
): Promise<string> {
  console.log(`[Reconciler] Generating post-share continuation for ${subjectName} (subject ${subjectId})`);

  // Get subject's current stage
  const stageProgress = await prisma.stageProgress.findFirst({
    where: { sessionId, userId: subjectId },
    orderBy: { stage: 'desc' },
  });
  const currentStage = stageProgress?.stage ?? 2; // Default to 2 if not found

  // Get recent conversation history for context
  const recentMessages = await prisma.message.findMany({
    where: {
      sessionId,
      OR: [
        { senderId: subjectId },
        { role: 'AI', forUserId: subjectId },
      ],
    },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  // Convert to format expected by prompt (reverse to chronological order)
  // Only include USER and AI messages - exclude EMPATHY_STATEMENT, SHARED_CONTEXT, etc.
  const conversationHistory = recentMessages
    .filter(m => m.role === 'USER' || m.role === 'AI')
    .reverse()
    .map(m => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

  const turnId = `${sessionId}-${Date.now()}`;

  // Create a minimal context bundle for the stage prompt
  // We don't need full memory/pattern context for post-share continuation
  const minimalContextBundle: ContextBundle = {
    conversationContext: {
      recentTurns: conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date().toISOString(), // Approximate
      })),
      turnCount: conversationHistory.filter(m => m.role === 'user').length,
      sessionDurationMinutes: 0, // Not critical for this use case
    },
    emotionalThread: {
      initialIntensity: 5,
      currentIntensity: 5, // Default moderate
      trend: 'stable' as const,
      notableShifts: [],
    },
    stageContext: {
      stage: currentStage,
      gatesSatisfied: {},
    },
    userName: subjectName,
    partnerName,
    intent: {
      intent: 'emotional_validation' as const,
      depth: 'minimal' as const,
      reason: 'Post-share continuation',
      threshold: 0.5,
      maxCrossSession: 0,
      allowCrossSession: false,
      surfaceStyle: 'silent' as const,
    },
    assembledAt: new Date().toISOString(),
  };

  // Build prompt context with justSharedWithPartner flag
  // This injects the share acknowledgment into the normal stage prompt
  const promptContext: PromptContext = {
    userName: subjectName,
    partnerName,
    turnCount: conversationHistory.filter(m => m.role === 'user').length,
    emotionalIntensity: 5, // Default moderate
    contextBundle: minimalContextBundle,
    justSharedWithPartner: {
      sharedContent,
    },
  };

  // Get the stage-appropriate prompt with post-share context injected
  const systemPrompt = buildStagePrompt(currentStage, promptContext);

  // Call Sonnet with conversation history
  const response = await getSonnetResponse({
    systemPrompt,
    messages: conversationHistory,
    maxTokens: 512,
    sessionId,
    turnId,
    operation: 'reconciler-post-share-continuation',
  });

  if (!response) {
    console.warn(`[Reconciler] Failed to generate continuation, using stage-aware fallback for stage ${currentStage}`);
    return getFallbackContinuation(currentStage, partnerName);
  }

  // Parse the JSON response and extract just the response field
  // The stage prompt returns: { "response": "...", "analysis": "...", ... }
  try {
    const parsed = extractJsonFromResponse(response) as { response?: string };
    if (parsed && typeof parsed.response === 'string') {
      console.log(`[Reconciler] Generated continuation for stage ${currentStage}: "${parsed.response.substring(0, 50)}..."`);
      return parsed.response;
    }
  } catch (error) {
    console.warn(`[Reconciler] Failed to parse JSON response, attempting fallback extraction:`, error);
  }

  // Fallback: strip analysis tags and try to extract response field via regex
  const stripped = response.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
  const responseMatch = stripped.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (responseMatch) {
    const extracted = responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    console.log(`[Reconciler] Extracted response via regex: "${extracted.substring(0, 50)}..."`);
    return extracted;
  }

  // Last resort: use fallback
  console.warn(`[Reconciler] All parsing failed, using fallback for stage ${currentStage}`);
  return getFallbackContinuation(currentStage, partnerName);
}

/**
 * Get a stage-appropriate fallback message (acknowledgment + continuation) if AI generation fails
 */
function getFallbackContinuation(stage: number, partnerName: string): string {
  const acknowledgment = `Thank you for sharing that with ${partnerName}. They'll have the chance to refine their understanding of what you're going through.`;

  let continuation: string;
  switch (stage) {
    case 1:
      continuation = `Is there anything else about how this situation has affected you that feels important to express?`;
      break;
    case 2:
      continuation = `Let's continue exploring ${partnerName}'s perspective. What do you imagine might be going on for ${partnerName} in all of this?`;
      break;
    case 3:
      continuation = `Let's continue identifying what you truly need here. What feels most important to you?`;
      break;
    case 4:
      continuation = `Let's continue thinking about what could work for both of you. What small step might help?`;
      break;
    default:
      continuation = `Let's continue our conversation. What's on your mind?`;
      break;
  }

  return `${acknowledgment}\n\n${continuation}`;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Run the reconciler for a session after both users complete Stage 2.
 * This analyzes empathy gaps in both directions.
 */
export async function runReconciler(
  sessionId: string,
  forUserId?: string
): Promise<{
  aUnderstandingB: ReconcilerResult | null;
  bUnderstandingA: ReconcilerResult | null;
  bothCompleted: boolean;
  readyToProceed: boolean;
  blockingReason: string | null;
}> {
  console.log(`[Reconciler] Starting reconciliation for session ${sessionId}`);

  // Get session with participants
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, firstName: true },
              },
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Get participants
  const members = session.relationship.members;
  if (members.length !== 2) {
    throw new Error(`Session ${sessionId} does not have exactly 2 members`);
  }

  const participants: SessionParticipants = {
    userA: {
      id: members[0].user.id,
      name: members[0].user.firstName || members[0].user.name || 'User A',
    },
    userB: {
      id: members[1].user.id,
      name: members[1].user.firstName || members[1].user.name || 'User B',
    },
  };

  // Check if both users have completed Stage 2 (shared empathy statements)
  const [userAEmpathy, userBEmpathy] = await Promise.all([
    getEmpathyData(sessionId, participants.userA.id),
    getEmpathyData(sessionId, participants.userB.id),
  ]);

  if (!userAEmpathy || !userBEmpathy) {
    return {
      aUnderstandingB: null,
      bUnderstandingA: null,
      bothCompleted: false,
      readyToProceed: false,
      blockingReason: !userAEmpathy
        ? `${participants.userA.name} has not shared their empathy statement yet`
        : `${participants.userB.name} has not shared their empathy statement yet`,
    };
  }

  // Get witnessing content for both users
  const [userAWitnessing, userBWitnessing] = await Promise.all([
    getWitnessingContent(sessionId, participants.userA.id),
    getWitnessingContent(sessionId, participants.userB.id),
  ]);

  // Run analysis for each direction (or just one if forUserId is specified)
  let aUnderstandingB: ReconcilerResult | null = null;
  let bUnderstandingA: ReconcilerResult | null = null;

  // A's guess about B (how well A understood B)
  if (!forUserId || forUserId === participants.userA.id) {
    aUnderstandingB = await analyzeEmpathyGap({
      sessionId,
      guesser: participants.userA,
      subject: participants.userB,
      empathyStatement: userAEmpathy.statement,
      witnessingContent: userBWitnessing,
    });
  }

  // B's guess about A (how well B understood A)
  if (!forUserId || forUserId === participants.userB.id) {
    bUnderstandingA = await analyzeEmpathyGap({
      sessionId,
      guesser: participants.userB,
      subject: participants.userA,
      empathyStatement: userBEmpathy.statement,
      witnessingContent: userAWitnessing,
    });
  }

  // Determine if ready to proceed
  // A direction is "ready" if:
  // - No result (skipped), OR
  // - Action is PROCEED, OR
  // - Action is OFFER_OPTIONAL but there's no suggestedShareFocus (treat as PROCEED per US-8)
  const isDirectionReady = (result: ReconcilerResult | null): boolean => {
    if (!result) return true;
    const { action, suggestedShareFocus } = result.recommendation;
    if (action === 'PROCEED') return true;
    if (action === 'OFFER_OPTIONAL' && !suggestedShareFocus) return true;
    return false;
  };

  const aReady = isDirectionReady(aUnderstandingB);
  const bReady = isDirectionReady(bUnderstandingA);
  const readyToProceed = aReady && bReady;

  return {
    aUnderstandingB,
    bUnderstandingA,
    bothCompleted: true,
    readyToProceed,
    blockingReason: readyToProceed
      ? null
      : 'There are empathy gaps that could benefit from additional sharing',
  };
}

/**
 * Generate a share suggestion for a specific direction after reconciler analysis.
 * Called when empathy status is set to AWAITING_SHARING to proactively create
 * the share offer so users see it immediately without needing to reload.
 *
 * @param sessionId - The session ID
 * @param guesserId - The user who made the empathy guess
 * @param subjectId - The user being guessed about (who will receive the share suggestion)
 */
export async function generateShareSuggestionForDirection(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<void> {
  console.log(`[Reconciler] generateShareSuggestionForDirection called: guesser=${guesserId}, subject=${subjectId}`);

  // Get user names
  const [guesser, subject] = await Promise.all([
    prisma.user.findUnique({
      where: { id: guesserId },
      select: { id: true, name: true, firstName: true },
    }),
    prisma.user.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, firstName: true },
    }),
  ]);

  if (!guesser || !subject) {
    console.error(`[Reconciler] generateShareSuggestionForDirection: Guesser or subject not found`);
    return;
  }

  const guesserInfo: UserInfo = {
    id: guesser.id,
    name: guesser.firstName || guesser.name || 'User',
  };
  const subjectInfo: UserInfo = {
    id: subject.id,
    name: subject.firstName || subject.name || 'User',
  };

  // Get the reconciler result
  const dbResult = await prisma.reconcilerResult.findFirst({
    where: {
      sessionId,
      guesserId,
      subjectId,
      supersededAt: null,
    },
    include: {
      shareOffer: true,
    },
  });

  if (!dbResult) {
    console.warn(`[Reconciler] generateShareSuggestionForDirection: No reconciler result found`);
    return;
  }

  // If share offer already exists, don't regenerate
  if (dbResult.shareOffer && dbResult.shareOffer.suggestedContent) {
    console.log(`[Reconciler] generateShareSuggestionForDirection: Share offer already exists, skipping`);
    return;
  }

  // Convert DB result to ReconcilerResult type
  const reconcilerResult = dbResultToReconcilerResult(dbResult);

  // Get subject's witnessing content
  const witnessingContent = await getWitnessingContent(sessionId, subjectId);

  // Generate the share suggestion (calls the private function)
  await generateShareSuggestion(
    sessionId,
    guesserInfo,
    subjectInfo,
    reconcilerResult,
    witnessingContent
  );

  console.log(`[Reconciler] generateShareSuggestionForDirection: Share suggestion created for subject ${subjectInfo.name}`);
}

/**
 * Run the reconciler for a SINGLE direction when subject completes Stage 1.
 * This is the new asymmetric flow - reconciler runs as soon as:
 * 1. Guesser has submitted empathy (status = HELD)
 * 2. Subject completes Stage 1 (confirms feelHeard)
 *
 * @param sessionId - The session ID
 * @param guesserId - The user who submitted the empathy statement (guesser)
 * @param subjectId - The user whose Stage 1 content will be compared (subject)
 * @returns The reconciler result for this direction
 */
export async function runReconcilerForDirection(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<{
  result: ReconcilerResult | null;
  empathyStatus: 'READY' | 'AWAITING_SHARING';
  shareOffer: {
    suggestedContent: string;
    reason: string;
  } | null;
}> {
  console.log(`[Reconciler] Running asymmetric reconciliation: ${guesserId} (guesser) → ${subjectId} (subject)`);

  // Get user names
  const [guesser, subject] = await Promise.all([
    prisma.user.findUnique({
      where: { id: guesserId },
      select: { id: true, name: true, firstName: true },
    }),
    prisma.user.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, firstName: true },
    }),
  ]);

  if (!guesser || !subject) {
    console.error(`[Reconciler] Guesser (${guesserId}) or subject (${subjectId}) not found in DB`);
    throw new Error('Guesser or subject not found');
  }

  const guesserInfo: UserInfo = {
    id: guesser.id,
    name: guesser.firstName || guesser.name || 'User',
  };
  const subjectInfo: UserInfo = {
    id: subject.id,
    name: subject.firstName || subject.name || 'User',
  };

  console.log(`[Reconciler] Participants: Guesser=${guesserInfo.name}, Subject=${subjectInfo.name}`);

  // ============================================================================
  // CIRCUIT BREAKER CHECK
  // ============================================================================
  const { shouldSkipReconciler, attempts } = await checkAttempts(
    sessionId,
    guesserId,
    subjectId
  );

  if (shouldSkipReconciler) {
    console.log(`[Reconciler] Circuit breaker tripped (${attempts} attempts). Forcing READY for ${guesserInfo.name} → ${subjectInfo.name}.`);
    await markEmpathyReady(sessionId, guesserId, subjectInfo.name, true);
    return {
      result: null,
      empathyStatus: 'READY',
      shareOffer: null,
    };
  }

  // Get guesser's empathy statement
  const empathyData = await getEmpathyData(sessionId, guesserId);
  if (!empathyData) {
    console.error(`[Reconciler] Guesser ${guesserInfo.name} has not submitted empathy statement for session ${sessionId}`);
    throw new Error('Guesser has not submitted empathy statement');
  }
  console.log(`[Reconciler] Found guesser empathy statement (length: ${empathyData.statement.length})`);

  // Get subject's witnessing content (Stage 1)
  const witnessingContent = await getWitnessingContent(sessionId, subjectId);
  if (!witnessingContent.userMessages) {
    console.error(`[Reconciler] Subject ${subjectInfo.name} has no Stage 1 content for session ${sessionId}`);
    throw new Error('Subject has no Stage 1 content');
  }
  console.log(`[Reconciler] Found subject witnessing content (${witnessingContent.themes.length} themes, ${witnessingContent.userMessages.length} chars)`);

  // Run the analysis
  console.log(`[Reconciler] Calling analyzeEmpathyGap...`);
  const result = await analyzeEmpathyGap({
    sessionId,
    guesser: guesserInfo,
    subject: subjectInfo,
    empathyStatement: empathyData.statement,
    witnessingContent,
  });

  // Determine outcome based on gaps
  // OFFER_SHARING: Significant gaps - strongly recommend sharing
  // OFFER_OPTIONAL: Moderate gaps - optionally offer sharing (only if suggestedShareFocus exists)
  // PROCEED: No/minor gaps - proceed without sharing
  const action = result.recommendation.action;
  const hasSuggestedFocus = !!result.recommendation.suggestedShareFocus;

  // Treat OFFER_OPTIONAL with null suggestedShareFocus as PROCEED (US-8)
  const shouldOfferSharing =
    action === 'OFFER_SHARING' ||
    (action === 'OFFER_OPTIONAL' && hasSuggestedFocus);

  console.log(`[Reconciler] Outcome analysis: severity=${result.gaps.severity}, action=${action}, hasSuggestedFocus=${hasSuggestedFocus}, shouldOfferSharing=${shouldOfferSharing}`);

  if (!shouldOfferSharing) {
    // No sharing needed - mark as READY (will reveal when both directions are ready)
    console.log(`[Reconciler] No sharing needed (action=${action}, focus=${hasSuggestedFocus}). Marking empathy as READY for ${guesserInfo.name} → ${subjectInfo.name}`);
    await markEmpathyReady(sessionId, guesserId, subjectInfo.name);

    return {
      result,
      empathyStatus: 'READY',
      shareOffer: null,
    };
  }

  // Check if context has already been shared for this direction
  const contextAlreadyShared = await hasContextAlreadyBeenShared(sessionId, guesserId, subjectId);
  if (contextAlreadyShared) {
    console.log(`[Reconciler] Context already shared ${subjectId}->${guesserId}, skipping AWAITING_SHARING, marking READY (gaps still present, using honest message)`);
    // Context was already shared but gaps remain after resubmission.
    // Mark READY to prevent infinite loop, but use the honest "let's move forward"
    // message instead of the false "quite accurate" claim.
    await markEmpathyReady(sessionId, guesserId, subjectInfo.name, true);

    return {
      result,
      empathyStatus: 'READY',
      shareOffer: null,
    };
  }

  // Significant gaps - generate share suggestion for subject
  console.log(`[Reconciler] SIGNIFICANT gaps found. Generating share suggestion for ${subjectInfo.name}...`);

  // Query the DB record once (it was just created in analyzeEmpathyGap)
  const dbReconcilerResult = await prisma.reconcilerResult.findFirst({
    where: {
      sessionId,
      guesserId,
      subjectId,
      supersededAt: null,
    },
  });

  const shareOffer = await generateShareSuggestion(
    sessionId,
    guesserInfo,
    subjectInfo,
    result,
    witnessingContent,
    dbReconcilerResult || undefined
  );

  // Update empathy attempt status to AWAITING_SHARING
  console.log(`[Reconciler] Updating empathy attempt status to AWAITING_SHARING for ${guesserInfo.name}`);
  await prisma.empathyAttempt.updateMany({
    where: { sessionId, sourceUserId: guesserId },
    data: { status: 'AWAITING_SHARING', statusVersion: { increment: 1 } },
  });

  // Notify the guesser that the subject is considering a share suggestion (US-5)
  // Include full empathy status to avoid extra HTTP round-trip
  const { notifyPartner } = await import('./realtime');
  const { buildEmpathyExchangeStatus } = await import('./empathy-status');
  const guesserEmpathyStatus = await buildEmpathyExchangeStatus(sessionId, guesserId);
  await notifyPartner(sessionId, guesserId, 'empathy.status_updated', {
    sessionId,
    timestamp: Date.now(),
    status: 'AWAITING_SHARING',
    forUserId: guesserId,
    empathyStatus: guesserEmpathyStatus,
    subjectName: subjectInfo.name,
    message: `${subjectInfo.name} is considering a suggestion to share more`,
  }).catch((err) => {
    console.warn(`[Reconciler] Failed to notify guesser of AWAITING_SHARING status:`, err);
  });

  return {
    result,
    empathyStatus: 'AWAITING_SHARING',
    shareOffer,
  };
}

/**
 * Generate a share suggestion for the subject based on reconciler gaps.
 * This creates a human-readable suggestion that the subject can accept, refine, or decline.
 *
 * @param dbReconcilerResult - Optional DB record to avoid retry loop (passed from runReconcilerForDirection)
 */
async function generateShareSuggestion(
  sessionId: string,
  guesser: UserInfo,
  subject: UserInfo,
  reconcilerResult: ReconcilerResult,
  witnessingContent: WitnessingContent,
  dbReconcilerResult?: any
): Promise<{
  suggestedContent: string;
  reason: string;
} | null> {
  console.log(`[Reconciler] Generating share suggestion for ${subject.name} (to help ${guesser.name})`);

  // Generate turnId upfront so COST and RECONCILER logs group together
  const turnId = `${sessionId}-${Date.now()}`;

  const response = await getSonnetJson<{ suggestedContent: string; reason: string }>({
    systemPrompt: `You are helping ${subject.name} understand what context they could share to help ${guesser.name} understand them better.

${guesser.name} tried to express empathy for ${subject.name}'s experience, but missed some important aspects:

Gap Analysis:
- Severity: ${reconcilerResult.gaps.severity}
- Summary: ${reconcilerResult.gaps.summary}
- Missed feelings: ${reconcilerResult.gaps.missedFeelings.join(', ')}
${reconcilerResult.gaps.mostImportantGap ? `- Most important gap: ${reconcilerResult.gaps.mostImportantGap}` : ''}

${subject.name}'s actual witnessing content (what they shared in Stage 1):
---
${witnessingContent.userMessages}
---

Generate a brief, specific suggestion for what ${subject.name} could share to help ${guesser.name} understand better. The suggestion should:
1. Be 1-3 sentences that ${subject.name} would say directly TO ${guesser.name}
2. Draw from what they actually shared (don't invent new content)
3. Address the most important gap in understanding
4. Feel natural and not forced

IMPORTANT GUIDELINES for the suggestion:
- Never start with confrontational phrases like "Look," or "Listen,"
- Focus on sharing ${subject.name}'s experience, not making claims about ${guesser.name}'s behavior
- Use "I" statements, never "you" accusations
- Keep the tone warm and vulnerable, not defensive or aggressive

Also explain briefly WHY sharing this would help (1 sentence).

Respond in JSON:
\`\`\`json
{
  "suggestedContent": "The suggestion text",
  "reason": "Why this would help"
}
\`\`\``,
    messages: [{ role: 'user', content: 'Generate the share suggestion.' }],
    maxTokens: 512,
    sessionId,
    turnId,
    operation: 'reconciler-share-suggestion',
  });

  if (!response) {
    console.warn(`[Reconciler] AI failed to generate share suggestion, returning null to signal error`);
    // Return null to signal failure - let caller handle the error state
    return null;
  }
  console.log(`[Reconciler] Share suggestion generated: "${response.suggestedContent.substring(0, 50)}..."`);
  console.log(`[Reconciler] Share reason: "${response.reason}"`);

  // Log the share suggestion for dashboard visibility (same turnId as COST log)
  /* await auditLog('RECONCILER', `Generated share suggestion for ${subject.name} to help ${guesser.name}`, {
    sessionId,
    turnId,
    eventType: 'share_suggestion',
    subjectName: subject.name,
    guesserName: guesser.name,
    suggestedContent: response.suggestedContent,
    reason: response.reason,
    gapContext: {
      severity: reconcilerResult.gaps.severity,
      mostImportantGap: reconcilerResult.gaps.mostImportantGap,
    },
  }); */

  // Use provided DB record or fall back to retry loop
  const dbResult = dbReconcilerResult || await findReconcilerResultWithRetry(sessionId, guesser.id, subject.id);

  if (dbResult) {
    console.log(`[Reconciler] Updating DB result ${dbResult.id} and creating/updating share offer`);
    await prisma.reconcilerResult.update({
      where: { id: dbResult.id },
      data: {
        suggestedShareContent: response.suggestedContent,
        suggestedShareReason: response.reason,
      },
    });

    // Create share offer record
    await prisma.reconcilerShareOffer.upsert({
      where: { resultId: dbResult.id },
      create: {
        resultId: dbResult.id,
        userId: subject.id,
        status: 'PENDING',
        suggestedContent: response.suggestedContent,
        suggestedReason: response.reason,
      },
      update: {
        status: 'PENDING',
        suggestedContent: response.suggestedContent,
        suggestedReason: response.reason,
      },
    });

    // Note: We don't create a SHARE_SUGGESTION message in chat.
    // The suggestion is stored in reconcilerShareOffer and displayed via the drawer only.
    console.log(`[Reconciler] Share suggestion stored for subject ${subject.id} (drawer only, not in chat)`);
  } else {
    console.error(`[Reconciler] CRITICAL: Could not find reconcilerResult! guesser=${guesser.id}, subject=${subject.id}, sessionId=${sessionId}`);
    console.error(`[Reconciler] This will cause the share suggestion to not be displayed to the user.`);
  }

  return response;
}

/**
 * Refine a share suggestion based on user feedback.
 * This regenerates the suggestion using AI, incorporating the user's refinement request.
 */
async function refineShareSuggestion(
  originalContent: string,
  refinementRequest: string,
  guesserName: string,
  subjectName: string,
  gapContext: {
    severity: string;
    summary: string;
    missedFeelings: string[];
    mostImportantGap: string | null;
  },
  sessionId: string
): Promise<string | null> {
  console.log(`[Reconciler] Refining share suggestion for ${subjectName} based on their feedback`);

  const turnId = `${sessionId}-refine-${Date.now()}`;

  const response = await getSonnetJson<{ refinedContent: string }>({
    systemPrompt: `You are helping ${subjectName} refine a message they want to share with ${guesserName}.

${guesserName} tried to express empathy for ${subjectName}'s experience but missed some important aspects:

Gap Analysis:
- Severity: ${gapContext.severity}
- Summary: ${gapContext.summary}
- Missed feelings: ${gapContext.missedFeelings.join(', ') || 'None specified'}
${gapContext.mostImportantGap ? `- Most important gap: ${gapContext.mostImportantGap}` : ''}

The AI previously generated this suggestion for ${subjectName} to share:
---
${originalContent}
---

${subjectName} wants to modify this suggestion. Their feedback is:
---
${refinementRequest}
---

Generate a refined version of the sharing suggestion that incorporates ${subjectName}'s feedback while still addressing the gaps in ${guesserName}'s understanding.

Guidelines:
1. Keep it 1-3 sentences that ${subjectName} would say directly TO ${guesserName}
2. Honor the user's specific feedback about what to change
3. Maintain the focus on sharing feelings and experience (not accusations)
4. Use "I" statements, keep the tone warm and vulnerable
5. Never start with confrontational phrases like "Look," or "Listen,"

Respond in JSON:
\`\`\`json
{
  "refinedContent": "The refined suggestion text"
}
\`\`\``,
    messages: [{ role: 'user', content: 'Generate the refined share suggestion.' }],
    maxTokens: 512,
    sessionId,
    turnId,
    operation: 'reconciler-refine-suggestion',
  });

  if (!response || !response.refinedContent) {
    console.warn(`[Reconciler] AI failed to refine share suggestion, returning null`);
    return null;
  }

  console.log(`[Reconciler] Refined suggestion generated: "${response.refinedContent.substring(0, 50)}..."`);
  return response.refinedContent;
}

/**
 * Get share suggestion for a user (called when they need to respond).
 */
export async function getShareSuggestionForUser(
  sessionId: string,
  userId: string
): Promise<{
  hasSuggestion: boolean;
  suggestion: {
    guesserName: string;
    suggestedContent: string;
    reason: string;
    canRefine: boolean;
  } | null;
}> {
  console.log(`[Reconciler] getShareSuggestionForUser called for user=${userId} in session=${sessionId}`);

  // Find share offer for this user in PENDING status
  const shareOffer = await prisma.reconcilerShareOffer.findFirst({
    where: {
      userId,
      status: 'PENDING',
      result: { sessionId },
    },
    include: {
      result: true,
    },
  });

  if (!shareOffer || !shareOffer.suggestedContent) {
    console.log(`[Reconciler] No PENDING share offer found for user ${userId}`);
    return { hasSuggestion: false, suggestion: null };
  }

  console.log(`[Reconciler] Found PENDING share offer ${shareOffer.id}. Marking as OFFERED.`);

  // Mark as OFFERED now that it's being viewed
  await prisma.reconcilerShareOffer.update({
    where: { id: shareOffer.id },
    data: { status: 'OFFERED' },
  });

  return {
    hasSuggestion: true,
    suggestion: {
      guesserName: shareOffer.result.guesserName,
      suggestedContent: shareOffer.suggestedContent,
      reason: shareOffer.suggestedReason || 'This would help them understand you better.',
      canRefine: true,
    },
  };
}

/**
 * Respond to a share suggestion (new flow with accept/refine/decline).
 */
export async function respondToShareSuggestion(
  sessionId: string,
  userId: string,
  response: {
    action: 'accept' | 'decline' | 'refine';
    refinedContent?: string;
  }
): Promise<{
  status: 'shared' | 'declined';
  sharedContent: string | null;
  guesserUpdated: boolean;
  sharedMessage?: {
    id: string;
    content: string;
    stage: number;
    timestamp: string;
  };
}> {
  console.log(`[Reconciler] respondToShareSuggestion called: user=${userId}, action=${response.action}`);

  // Get the share offer - allow both OFFERED and PENDING status to handle race conditions
  // where the user responds before the GET endpoint marked it as OFFERED
  const shareOffer = await prisma.reconcilerShareOffer.findFirst({
    where: {
      userId,
      status: { in: ['OFFERED', 'PENDING'] },
      result: { sessionId },
    },
    include: {
      result: true,
    },
  });

  if (!shareOffer) {
    console.warn(`[Reconciler] No OFFERED/PENDING share offer found for user ${userId} in session ${sessionId}`);
    throw new Error('No pending share offer found');
  }

  // If status was PENDING (user responded before fetching), mark as OFFERED first for proper tracking
  if (shareOffer.status === 'PENDING') {
    console.log(`[Reconciler] Share offer was PENDING, marking as OFFERED before processing response`);
    await prisma.reconcilerShareOffer.update({
      where: { id: shareOffer.id },
      data: { status: 'OFFERED' },
    });
  }

  if (response.action === 'decline') {
    console.log(`[Reconciler] User ${userId} declined share offer. Marking guesser's empathy as READY.`);

    // Wrap decline DB writes in a transaction for consistency
    await prisma.$transaction(async (tx) => {
      // Idempotency guard: only update if still in OFFERED/PENDING state
      const updated = await tx.reconcilerShareOffer.updateMany({
        where: {
          id: shareOffer.id,
          status: { in: ['OFFERED', 'PENDING'] },
        },
        data: {
          status: 'DECLINED',
          declinedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new Error('Share offer already processed');
      }

      // Mark guesser's empathy as READY (will reveal when both directions are ready)
      await tx.empathyAttempt.updateMany({
        where: { sessionId, sourceUserId: shareOffer.result.guesserId },
        data: {
          status: 'READY',
          statusVersion: { increment: 1 },
        },
      });

      // Delete the SHARE_SUGGESTION message now that user has responded
      await tx.message.deleteMany({
        where: {
          sessionId,
          forUserId: userId,
          role: MessageRole.SHARE_SUGGESTION,
        },
      });
    });

    console.log(`[Reconciler] Declined share offer for user ${userId} (transaction committed)`);

    // Check if both directions are now READY and reveal both if so (outside transaction)
    await checkAndRevealBothIfReady(sessionId);

    return {
      status: 'declined',
      sharedContent: null,
      guesserUpdated: true,
    };
  }

  // User accepted or refined — do AI calls first (outside transaction)
  let sharedContent: string;

  if (response.action === 'refine' && response.refinedContent) {
    // Call AI to regenerate the suggestion based on user's feedback
    const refinedContent = await refineShareSuggestion(
      shareOffer.suggestedContent || '',
      response.refinedContent,
      shareOffer.result.guesserName,
      shareOffer.result.subjectName,
      {
        severity: shareOffer.result.gapSeverity,
        summary: shareOffer.result.gapSummary,
        missedFeelings: shareOffer.result.missedFeelings,
        mostImportantGap: shareOffer.result.mostImportantGap,
      },
      sessionId
    );

    if (!refinedContent) {
      console.warn(`[Reconciler] AI failed to refine suggestion, falling back to original`);
      sharedContent = shareOffer.suggestedContent || '';
    } else {
      sharedContent = refinedContent;
    }
  } else {
    sharedContent = shareOffer.suggestedContent || '';
  }

  // Error if suggestedContent was somehow empty - this is a data integrity issue
  if (!sharedContent.trim()) {
    console.error(`[Reconciler] suggestedContent was empty for share offer ${shareOffer.id}, cannot proceed`);
    throw new Error('Share suggestion content is empty - cannot share');
  }

  console.log(`[Reconciler] User ${userId} ${response.action}ed share offer. Shared content: "${sharedContent.substring(0, 50)}..."`);

  const subjectName = shareOffer.result.subjectName;
  const guesserName = shareOffer.result.guesserName;

  // Generate AI acknowledgment for subject (outside transaction — AI call)
  const subjectAckMessage = await generatePostShareContinuation(
    sessionId,
    userId,
    subjectName,
    guesserName,
    sharedContent
  );

  // Get subject's current stage for the message
  const subjectProgress = await prisma.stageProgress.findFirst({
    where: { sessionId, userId },
    orderBy: { stage: 'desc' },
  });
  const subjectCurrentStage = subjectProgress?.stage ?? 2;

  // Wrap all DB writes in a transaction for atomicity
  await prisma.$transaction(async (tx) => {
    const now = new Date();

    // Idempotency guard: only update if still in OFFERED/PENDING state
    const updated = await tx.reconcilerShareOffer.updateMany({
      where: {
        id: shareOffer.id,
        status: { in: ['OFFERED', 'PENDING'] },
      },
      data: {
        status: 'ACCEPTED',
        refinedContent: response.action === 'refine' ? response.refinedContent : null,
        sharedContent,
        sharedAt: now,
        deliveryStatus: 'DELIVERED',
        deliveredAt: now,
      },
    });
    if (updated.count === 0) {
      throw new Error('Share offer already processed');
    }

    // Delete the SHARE_SUGGESTION message
    await tx.message.deleteMany({
      where: {
        sessionId,
        forUserId: userId,
        role: MessageRole.SHARE_SUGGESTION,
      },
    });

    // Update guesser's empathy attempt to REFINING
    await tx.empathyAttempt.updateMany({
      where: { sessionId, sourceUserId: shareOffer.result.guesserId },
      data: { status: 'REFINING', statusVersion: { increment: 1 } },
    });

    // Create messages with guaranteed ordering (100ms apart)
    const baseTime = now.getTime();
    const introTimestamp = new Date(baseTime);
    const sharedContextTimestamp = new Date(baseTime + 100);
    const reflectionTimestamp = new Date(baseTime + 200);
    const subjectAckTimestamp = new Date(baseTime + 300);

    // Intro message for guesser (US-7: Shared Content Label)
    await tx.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: shareOffer.result.guesserId,
        role: 'AI',
        content: `${subjectName} hasn't seen your empathy statement yet because the reconciler suggested they share more. This is what they shared:`,
        stage: 2,
        timestamp: introTimestamp,
      },
    });

    // SHARED_CONTEXT message (the actual content shared by subject)
    await tx.message.create({
      data: {
        sessionId,
        senderId: userId,
        forUserId: shareOffer.result.guesserId,
        role: MessageRole.SHARED_CONTEXT,
        content: sharedContent,
        stage: 2,
        timestamp: sharedContextTimestamp,
      },
    });

    // Reflection prompt for guesser
    await tx.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: shareOffer.result.guesserId,
        role: 'AI',
        content: `How does this land for you? Take a moment to reflect on what ${subjectName} shared. Does this give you any new insight into what they might be experiencing?`,
        stage: 2,
        timestamp: reflectionTimestamp,
      },
    });

    // Subject acknowledgment message
    await tx.message.create({
      data: {
        sessionId,
        senderId: null,
        forUserId: userId,
        role: 'AI',
        content: subjectAckMessage,
        stage: subjectCurrentStage,
        timestamp: subjectAckTimestamp,
      },
    });
  });

  console.log(`[Reconciler] Share accepted for user ${userId} (transaction committed)`);

  return {
    status: 'shared',
    sharedContent,
    guesserUpdated: true,
  };
}

/**
 * Check if partner has completed Stage 1 (used to determine if reconciler should run).
 */
export async function hasPartnerCompletedStage1(
  sessionId: string,
  partnerId: string
): Promise<boolean> {
  const progress = await prisma.stageProgress.findUnique({
    where: {
      sessionId_userId_stage: {
        sessionId,
        userId: partnerId,
        stage: 1,
      },
    },
  });

  if (!progress) return false;

  const gates = progress.gatesSatisfied as Record<string, unknown> | null;
  return gates?.feelHeard === true || gates?.feelHeardConfirmed === true;
}

/**
 * Get shared context for a guesser (if subject shared something).
 */
export async function getSharedContextForGuesser(
  sessionId: string,
  guesserId: string
): Promise<{
  hasSharedContext: boolean;
  content: string | null;
  sharedAt: string | null;
}> {
  const shareOffer = await prisma.reconcilerShareOffer.findFirst({
    where: {
      result: {
        sessionId,
        guesserId,
      },
      status: 'ACCEPTED',
    },
  });

  if (!shareOffer || !shareOffer.sharedContent) {
    return { hasSharedContext: false, content: null, sharedAt: null };
  }

  return {
    hasSharedContext: true,
    content: shareOffer.sharedContent,
    sharedAt: shareOffer.sharedAt?.toISOString() || null,
  };
}

/**
 * Get the delivery status of shared content for the subject (person who shared).
 * Uses the same mechanism as message read tracking (lastViewedAt on UserVessel).
 *
 * Returns the delivery status:
 * - 'pending': Share not yet accepted (no SHARED_CONTEXT message created)
 * - 'delivered': Message created but guesser hasn't viewed since then
 * - 'seen': Guesser has viewed the session after the message was created
 */
export async function getSharedContentDeliveryStatus(
  sessionId: string,
  subjectId: string
): Promise<{
  hasSharedContent: boolean;
  deliveryStatus: 'pending' | 'delivered' | 'seen' | null;
  sharedAt: string | null;
  sharedContent: string | null;
}> {
  // Find the share offer to get the guesser ID
  const shareOffer = await prisma.reconcilerShareOffer.findFirst({
    where: {
      userId: subjectId,
      result: { sessionId },
      status: 'ACCEPTED',
    },
    include: {
      result: true,
    },
  });

  if (!shareOffer || !shareOffer.sharedContent || !shareOffer.sharedAt) {
    return { hasSharedContent: false, deliveryStatus: null, sharedAt: null, sharedContent: null };
  }

  const guesserId = shareOffer.result.guesserId;
  const sharedAt = shareOffer.sharedAt;

  // Check if the guesser has viewed the Share/Partner tab after the content was shared
  // We use lastViewedShareTabAt (not lastViewedAt) so content is only "seen" when
  // the user actually views the Partner tab, not just the AI chat
  const guesserVessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: {
        userId: guesserId,
        sessionId,
      },
    },
    select: {
      lastViewedShareTabAt: true,
    },
  });

  let deliveryStatus: 'pending' | 'delivered' | 'seen' = 'delivered';

  if (guesserVessel?.lastViewedShareTabAt && guesserVessel.lastViewedShareTabAt >= sharedAt) {
    // Guesser has viewed the Share tab after the content was shared
    deliveryStatus = 'seen';
  }

  return {
    hasSharedContent: true,
    deliveryStatus,
    sharedAt: sharedAt.toISOString(),
    sharedContent: shareOffer.sharedContent,
  };
}

/**
 * Analyze the empathy gap for one direction (guesser → subject).
 */
async function analyzeEmpathyGap(
  input: ReconcilerAnalysisInput
): Promise<ReconcilerResult> {
  console.log(
    `[Reconciler] Analyzing ${input.guesser.name}'s understanding of ${input.subject.name}`
  );
  console.log(`[Reconciler] Input empathy statement: "${input.empathyStatement.substring(0, 100)}..."`);
  console.log(`[Reconciler] Subject themes: ${input.witnessingContent.themes.join(', ')}`);

  // Check if we already have a result for this direction
  const existingResult = await prisma.reconcilerResult.findFirst({
    where: {
      sessionId: input.sessionId,
      guesserId: input.guesser.id,
      subjectId: input.subject.id,
      supersededAt: null,
    },
  });

  if (existingResult) {
    console.log(`[Reconciler] Using cached result for ${input.guesser.name} → ${input.subject.name}`);
    return dbResultToReconcilerResult(existingResult);
  }

  // Generate turnId upfront so COST and RECONCILER logs group together
  const turnId = `${input.sessionId}-${Date.now()}`;

  // Build context for the AI prompt
  const context: ReconcilerContext = {
    guesserName: input.guesser.name,
    subjectName: input.subject.name,
    empathyStatement: input.empathyStatement,
    witnessingContent: input.witnessingContent.userMessages,
    extractedThemes: input.witnessingContent.themes,
  };

  const prompt = buildReconcilerPrompt(context);
  console.log(`[Reconciler] Built analysis prompt (length: ${prompt.length})`);

  // Call AI to analyze the gap
  const result = await getSonnetJson<ReconcilerResult>({
    systemPrompt: prompt,
    messages: [{ role: 'user', content: 'Analyze the empathy gap and provide your assessment.' }],
    maxTokens: 2048,
    sessionId: input.sessionId,
    turnId,
    operation: 'reconciler-analysis',
  });

  if (!result) {
    // Fallback result if AI fails
    console.warn(`[Reconciler] AI analysis failed, using fallback`);
    return getDefaultReconcilerResult();
  }

  console.log(`[Reconciler] AI returned alignment score: ${result.alignment.score}%`);
  console.log(`[Reconciler] AI identified gaps: ${result.gaps.severity} (${result.gaps.missedFeelings.length} missed feelings)`);
  console.log(`[Reconciler] AI recommendation: ${result.recommendation.action}`);

  // Generate abstract guidance for refinement (doesn't expose partner's specific content)
  const abstractGuidance = generateAbstractGuidance(result);

  // Save result to database with abstract guidance fields
  console.log(`[Reconciler] Saving result to database for ${input.guesser.name} → ${input.subject.name}`);
  await prisma.reconcilerResult.create({
    data: {
      sessionId: input.sessionId,
      guesserId: input.guesser.id,
      guesserName: input.guesser.name,
      subjectId: input.subject.id,
      subjectName: input.subject.name,
      alignmentScore: result.alignment.score,
      alignmentSummary: result.alignment.summary,
      correctlyIdentified: result.alignment.correctlyIdentified,
      gapSeverity: result.gaps.severity,
      gapSummary: result.gaps.summary,
      missedFeelings: result.gaps.missedFeelings,
      misattributions: result.gaps.misattributions,
      mostImportantGap: result.gaps.mostImportantGap,
      recommendedAction: result.recommendation.action,
      rationale: result.recommendation.rationale,
      sharingWouldHelp: result.recommendation.sharingWouldHelp,
      suggestedShareFocus: result.recommendation.suggestedShareFocus,
      // Abstract guidance for refinement conversation
      areaHint: abstractGuidance.areaHint,
      guidanceType: abstractGuidance.guidanceType,
      promptSeed: abstractGuidance.promptSeed,
    },
  });

  // Add abstract guidance to the result for returning
  result.abstractGuidance = abstractGuidance;

  console.log(
    `[Reconciler] Analysis complete: ${result.alignment.score}% alignment, ` +
    `${result.gaps.severity} gaps, action: ${result.recommendation.action}`
  );

  // Log the reconciler analysis for dashboard visibility (same turnId as COST log)
  /* await auditLog('RECONCILER', `Analyzed ${input.guesser.name}'s understanding of ${input.subject.name}`, {
    sessionId: input.sessionId,
    turnId,
    eventType: 'analysis',
    guesserName: input.guesser.name,
    subjectName: input.subject.name,
    alignment: {
      score: result.alignment.score,
      summary: result.alignment.summary,
      correctlyIdentified: result.alignment.correctlyIdentified,
    },
    gaps: {
      severity: result.gaps.severity,
      summary: result.gaps.summary,
      missedFeelings: result.gaps.missedFeelings,
      misattributions: result.gaps.misattributions,
      mostImportantGap: result.gaps.mostImportantGap,
    },
    recommendation: {
      action: result.recommendation.action,
      rationale: result.recommendation.rationale,
      sharingWouldHelp: result.recommendation.sharingWouldHelp,
      suggestedShareFocus: result.recommendation.suggestedShareFocus,
    },
  }); */

  return result;
}

/**
 * Generate a share offer for a user based on reconciler results.
 */
export async function generateShareOffer(
  sessionId: string,
  subjectId: string
): Promise<{
  offerMessage: string;
  suggestedContent: string;
  suggestedReason: string;
  gapDescription: string;
} | null> {
  // Get the reconciler result for this direction
  const result = await prisma.reconcilerResult.findFirst({
    where: {
      sessionId,
      subjectId,
      supersededAt: null,
    },
    include: {
      shareOffer: true,
    },
  });

  if (!result) {
    console.warn(`[Reconciler] No result found for subject ${subjectId}`);
    return null;
  }

  // If share offer already exists and was processed, return null
  if (result.shareOffer && result.shareOffer.status !== 'NOT_OFFERED') {
    return null;
  }

  // Get the subject's witnessing content for crafting the suggestion
  const witnessingContent = await getWitnessingContent(sessionId, subjectId);

  // Get partner name
  const guesser = await prisma.user.findUnique({
    where: { id: result.guesserId },
    select: { firstName: true, name: true },
  });
  const partnerName = guesser?.firstName || guesser?.name || 'your partner';

  const subject = await prisma.user.findUnique({
    where: { id: subjectId },
    select: { firstName: true, name: true },
  });
  const userName = subject?.firstName || subject?.name || 'you';

  // Generate the offer message and AI-crafted share suggestion in parallel
  const shareOfferContext: ShareOfferContext = {
    userName,
    partnerName,
    gapSummary: result.gapSummary,
    mostImportantGap: result.mostImportantGap || result.gapSummary,
  };

  const [offerResult, suggestionResult] = await Promise.all([
    getSonnetJson<ShareOfferMessage>({
      systemPrompt: buildShareOfferPrompt(shareOfferContext),
      messages: [{ role: 'user', content: 'Generate the share offer message.' }],
      maxTokens: 512,
      sessionId,
      operation: 'reconciler-share-offer',
    }),
    // Generate an AI-crafted, feelings-focused suggestion (not direct quotes)
    getSonnetJson<{ suggestedContent: string; reason: string }>({
      systemPrompt: `You are helping ${userName} express their feelings to ${partnerName} in a way that builds understanding.

${partnerName} tried to understand ${userName}'s experience but missed some important aspects:
- Gap summary: ${result.gapSummary}
${result.mostImportantGap ? `- Most important gap: ${result.mostImportantGap}` : ''}

Here is what ${userName} actually shared about their experience:
---
${witnessingContent.userMessages}
---

Your job is to CRAFT a feelings-focused message that ${userName} would say directly TO ${partnerName}. This is NOT about extracting quotes - you must transform their raw expression into something that:

1. FOCUSES ON FEELINGS AND NEEDS
   - Transform complaints into expressions of underlying feelings
   - Example: "They never listen!" → "I feel unheard when I share something important and don't get a response"
   - Example: "They're so controlling!" → "I feel anxious when decisions are made without including me"

2. USES SIMPLE, CONVERSATIONAL LANGUAGE
   - No psychology jargon or "NVC speak"
   - Write like a wise friend would talk, not a textbook
   - Keep it natural and genuine

3. REMOVES ATTACKING OR BLAMING LANGUAGE
   - No "you always" or "you never" accusations
   - No character judgments about ${partnerName}
   - Focus on ${userName}'s internal experience, not ${partnerName}'s behavior

4. STAYS TRUE TO WHAT THEY SHARED
   - Draw from their actual content (don't invent new feelings)
   - But express it in a way that invites understanding rather than defensiveness

5. IS BRIEF AND FOCUSED
   - 1-3 sentences maximum
   - Address the most important gap in understanding

IMPORTANT GUIDELINES:
- Never start with confrontational phrases like "Look," or "Listen,"
- Never include accusations or blame
- The goal is to help ${partnerName} understand, not to convince them they're wrong

Respond in JSON:
\`\`\`json
{
  "suggestedContent": "The feelings-focused message",
  "reason": "Brief explanation of why this helps bridge the gap"
}
\`\`\``,
      messages: [{ role: 'user', content: 'Craft a feelings-focused share suggestion.' }],
      maxTokens: 512,
      sessionId,
      operation: 'reconciler-share-suggestion-craft',
    }),
  ]);

  if (!offerResult || !suggestionResult) {
    console.warn(`[Reconciler] Failed to generate share offer or suggestion`);
    return null;
  }

  console.log(`[Reconciler] Generated feelings-focused suggestion: "${suggestionResult.suggestedContent.substring(0, 50)}..."`);

  // Create or update share offer record with the crafted suggestion
  await prisma.reconcilerShareOffer.upsert({
    where: { resultId: result.id },
    create: {
      resultId: result.id,
      userId: subjectId,
      status: 'OFFERED',
      offerMessage: offerResult.message,
      suggestedContent: suggestionResult.suggestedContent,
      suggestedReason: suggestionResult.reason,
    },
    update: {
      status: 'OFFERED',
      offerMessage: offerResult.message,
      suggestedContent: suggestionResult.suggestedContent,
      suggestedReason: suggestionResult.reason,
    },
  });

  return {
    offerMessage: offerResult.message,
    suggestedContent: suggestionResult.suggestedContent,
    suggestedReason: suggestionResult.reason,
    gapDescription: result.mostImportantGap || result.gapSummary,
  };
}

/**
 * Get the reconciler status for a session.
 */
export async function getReconcilerStatus(sessionId: string): Promise<{
  hasRun: boolean;
  aUnderstandingB: ReconcilerResult | null;
  bUnderstandingA: ReconcilerResult | null;
  pendingShareOffers: number;
  readyForStage3: boolean;
}> {
  const results = await prisma.reconcilerResult.findMany({
    where: { sessionId, supersededAt: null },
    include: { shareOffer: true },
    orderBy: { guesserId: 'asc' },
  });

  if (results.length === 0) {
    return {
      hasRun: false,
      aUnderstandingB: null,
      bUnderstandingA: null,
      pendingShareOffers: 0,
      readyForStage3: false,
    };
  }

  // Count pending share offers (status = OFFERED)
  const pendingShareOffers = results.filter(
    (r) => r.shareOffer?.status === 'OFFERED'
  ).length;

  // Ready for Stage 3 if:
  // 1. Both directions have been analyzed
  // 2. No pending share offers
  // 3. All recommendations are PROCEED, or sharing was completed/declined
  const readyForStage3 =
    results.length === 2 &&
    pendingShareOffers === 0 &&
    results.every(
      (r) =>
        r.recommendedAction === 'PROCEED' ||
        !r.shareOffer ||
        r.shareOffer.status === 'ACCEPTED' ||
        r.shareOffer.status === 'DECLINED' ||
        r.shareOffer.status === 'SKIPPED'
    );

  return {
    hasRun: true,
    aUnderstandingB: results[0] ? dbResultToReconcilerResult(results[0]) : null,
    bUnderstandingA: results[1] ? dbResultToReconcilerResult(results[1]) : null,
    pendingShareOffers,
    readyForStage3,
  };
}

/**
 * Generate a summary after reconciliation is complete.
 */
export async function generateReconcilerSummary(
  sessionId: string
): Promise<ReconcilerSummary | null> {
  const results = await prisma.reconcilerResult.findMany({
    where: { sessionId, supersededAt: null },
    include: { shareOffer: true },
    orderBy: { guesserId: 'asc' },
  });

  if (results.length !== 2) {
    return null;
  }

  const [resultA, resultB] = results;

  const context: ReconcilerSummaryContext = {
    userAName: resultA.guesserName,
    userBName: resultB.guesserName,
    aUnderstandingB: {
      alignmentScore: resultA.alignmentScore,
      alignmentSummary: resultA.alignmentSummary,
      gapSeverity: resultA.gapSeverity as 'none' | 'minor' | 'moderate' | 'significant',
    },
    bUnderstandingA: {
      alignmentScore: resultB.alignmentScore,
      alignmentSummary: resultB.alignmentSummary,
      gapSeverity: resultB.gapSeverity as 'none' | 'minor' | 'moderate' | 'significant',
    },
    additionalSharingOccurred:
      resultA.shareOffer?.status === 'ACCEPTED' ||
      resultB.shareOffer?.status === 'ACCEPTED',
  };

  const summary = await getSonnetJson<ReconcilerSummary>({
    systemPrompt: buildReconcilerSummaryPrompt(context),
    messages: [{ role: 'user', content: 'Generate the reconciler summary.' }],
    maxTokens: 512,
    sessionId,
    operation: 'reconciler-summary',
  });

  return summary;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get empathy data for a user (their shared empathy statement).
 */
async function getEmpathyData(
  sessionId: string,
  userId: string
): Promise<EmpathyData | null> {
  const attempt = await prisma.empathyAttempt.findFirst({
    where: {
      sessionId,
      sourceUserId: userId,
    },
  });

  if (!attempt) {
    return null;
  }

  return {
    statement: attempt.content,
    sharedAt: attempt.sharedAt ?? new Date(),
  };
}

/**
 * Get witnessing content for a user (their Stage 1 messages).
 */
async function getWitnessingContent(
  sessionId: string,
  userId: string
): Promise<WitnessingContent> {
  // Get all user messages from Stage 1
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      senderId: userId,
      stage: 1,
      role: 'USER',
    },
    orderBy: { timestamp: 'asc' },
    select: { content: true, extractedEmotions: true },
  });

  // Combine all messages
  const userMessages = messages.map((m) => m.content).join('\n\n');

  // Extract unique themes/emotions
  const themes = new Set<string>();
  messages.forEach((m) => {
    m.extractedEmotions?.forEach((e) => themes.add(e));
  });

  // If no extracted emotions, try to extract key themes using AI (quick analysis)
  let themesList = Array.from(themes);
  if (themesList.length === 0 && userMessages.length > 0) {
    themesList = await extractThemes(userMessages, sessionId, userId);
  }

  return {
    userMessages,
    themes: themesList,
  };
}

/**
 * Extract key themes from witnessing content using AI.
 */
async function extractThemes(content: string, sessionId: string, userId?: string): Promise<string[]> {
  // Include userId in turnId for proper attribution
  const effectiveUserId = userId || getCurrentUserId() || 'system';
  const turnId = `${sessionId}-${effectiveUserId}-extract-themes-${Date.now()}`;
  const result = await getHaikuJson<{ themes: string[] }>({
    systemPrompt: `Extract 3-5 key emotional themes or feelings from this witnessing content. Return as JSON: {"themes": ["theme1", "theme2", ...]}`,
    messages: [{ role: 'user', content }],
    maxTokens: 256,
    sessionId,
    turnId,
    operation: 'reconciler-extract-themes',
    callType: BrainActivityCallType.THEME_EXTRACTION,
  });

  return result?.themes || [];
}

/**
 * Abstract guidance type for refinement conversations.
 */
interface AbstractGuidance {
  areaHint: string | null;
  guidanceType: string | null;
  promptSeed: string | null;
}

/**
 * Generate abstract guidance for refinement conversation.
 * This extracts general themes without revealing partner's specific content.
 *
 * Key constraint: The guidance should help the refinement AI ask good questions
 * without revealing what the partner actually said.
 */
function generateAbstractGuidance(result: ReconcilerResult): AbstractGuidance {
  // If no significant gaps, no guidance needed
  if (result.gaps.severity === 'none' || result.gaps.severity === 'minor') {
    return {
      areaHint: null,
      guidanceType: null,
      promptSeed: null,
    };
  }

  // Extract abstract area hint from missed feelings
  // e.g., ["unappreciated", "unseen at work"] → "work and effort"
  let areaHint: string | null = null;
  if (result.gaps.missedFeelings.length > 0) {
    // Look for common themes in missed feelings
    const feelingText = result.gaps.missedFeelings.join(' ').toLowerCase();
    if (feelingText.includes('work') || feelingText.includes('effort') || feelingText.includes('appreciate')) {
      areaHint = 'work and effort';
    } else if (feelingText.includes('connect') || feelingText.includes('close') || feelingText.includes('together')) {
      areaHint = 'connection and closeness';
    } else if (feelingText.includes('safe') || feelingText.includes('secure') || feelingText.includes('trust')) {
      areaHint = 'safety and security';
    } else if (feelingText.includes('hear') || feelingText.includes('listen') || feelingText.includes('understand')) {
      areaHint = 'being heard and understood';
    } else if (feelingText.includes('respect') || feelingText.includes('value')) {
      areaHint = 'respect and value';
    } else {
      // Generic fallback based on first missed feeling category
      areaHint = 'deeper emotional experiences';
    }
  }

  // Determine guidance type based on gap characteristics
  let guidanceType: string | null = null;
  if (result.gaps.misattributions.length > 0) {
    // User made incorrect assumptions
    guidanceType = 'challenge_assumptions';
  } else if (result.gaps.missedFeelings.length > 2) {
    // Multiple missed feelings - need broader exploration
    guidanceType = 'explore_breadth';
  } else {
    // Default: help user explore deeper
    guidanceType = 'explore_deeper_feelings';
  }

  // Generate prompt seed (abstract starting point for questions)
  let promptSeed: string | null = null;
  switch (guidanceType) {
    case 'challenge_assumptions':
      promptSeed = 'what might be different from your initial understanding';
      break;
    case 'explore_breadth':
      promptSeed = 'other aspects of their experience';
      break;
    case 'explore_deeper_feelings':
    default:
      promptSeed = 'what might be underneath the surface';
      break;
  }

  return {
    areaHint,
    guidanceType,
    promptSeed,
  };
}

/**
 * Convert database result to ReconcilerResult type.
 */
function dbResultToReconcilerResult(
  db: {
    alignmentScore: number;
    alignmentSummary: string;
    correctlyIdentified: string[];
    gapSeverity: string;
    gapSummary: string;
    missedFeelings: string[];
    misattributions: string[];
    mostImportantGap: string | null;
    recommendedAction: string;
    rationale: string;
    sharingWouldHelp: boolean;
    suggestedShareFocus: string | null;
    areaHint?: string | null;
    guidanceType?: string | null;
    promptSeed?: string | null;
  }
): ReconcilerResult {
  return {
    alignment: {
      score: db.alignmentScore,
      summary: db.alignmentSummary,
      correctlyIdentified: db.correctlyIdentified,
    },
    gaps: {
      severity: db.gapSeverity as 'none' | 'minor' | 'moderate' | 'significant',
      summary: db.gapSummary,
      missedFeelings: db.missedFeelings,
      misattributions: db.misattributions,
      mostImportantGap: db.mostImportantGap,
    },
    recommendation: {
      action: db.recommendedAction as 'PROCEED' | 'OFFER_OPTIONAL' | 'OFFER_SHARING',
      rationale: db.rationale,
      sharingWouldHelp: db.sharingWouldHelp,
      suggestedShareFocus: db.suggestedShareFocus,
    },
    abstractGuidance: {
      areaHint: db.areaHint ?? null,
      guidanceType: db.guidanceType ?? null,
      promptSeed: db.promptSeed ?? null,
    },
  };
}

/**
 * Get default reconciler result when AI fails.
 */
function getDefaultReconcilerResult(): ReconcilerResult {
  return {
    alignment: {
      score: 70,
      summary: 'Unable to fully analyze the empathy exchange.',
      correctlyIdentified: [],
    },
    gaps: {
      severity: 'minor',
      summary: 'Analysis unavailable - defaulting to minor gaps.',
      missedFeelings: [],
      misattributions: [],
      mostImportantGap: null,
    },
    recommendation: {
      action: 'PROCEED',
      rationale: 'Defaulting to proceed due to analysis unavailability.',
      sharingWouldHelp: false,
      suggestedShareFocus: null,
    },
  };
}

// ============================================================================
// Mutual Reveal: Both directions must be READY before revealing either
// ============================================================================

/**
 * Check if both empathy attempts are READY and if so, reveal both simultaneously.
 * This ensures neither user sees their partner's empathy until both have completed Stage 2.
 *
 * @returns true if both were revealed, false otherwise
 */
export async function checkAndRevealBothIfReady(sessionId: string): Promise<boolean> {
  console.log(`[Reconciler] checkAndRevealBothIfReady called for session ${sessionId}`);

  // Get both empathy attempts for this session
  const attempts = await prisma.empathyAttempt.findMany({
    where: { sessionId },
  });

  if (attempts.length !== 2) {
    console.log(`[Reconciler] Session ${sessionId} has ${attempts.length} empathy attempts, need 2 for mutual reveal`);
    return false;
  }

  // Check if both are in READY status
  const bothReady = attempts.every((a) => a.status === 'READY');
  if (!bothReady) {
    const statuses = attempts.map((a) => `${a.sourceUserId}: ${a.status}`).join(', ');
    console.log(`[Reconciler] Not both READY yet: ${statuses}`);
    return false;
  }

  console.log(`[Reconciler] Both empathy attempts are READY - revealing both simultaneously`);

  // Reveal both attempts
  const revealedNow = new Date();
  await prisma.empathyAttempt.updateMany({
    where: {
      sessionId,
      status: 'READY',
    },
    data: {
      status: 'REVEALED',
      statusVersion: { increment: 1 },
      revealedAt: revealedNow,
      deliveryStatus: 'DELIVERED',
      deliveredAt: revealedNow,
    },
  });

  // Notify both users that empathy has been revealed
  // Include full empathy status for each user to avoid extra HTTP round-trips
  const { notifyPartner } = await import('./realtime');
  const { buildEmpathyExchangeStatusForBothUsers } = await import('./empathy-status');
  const allStatuses = await buildEmpathyExchangeStatusForBothUsers(sessionId);

  for (const attempt of attempts) {
    const userId = attempt.sourceUserId!;
    // Notify the guesser that their empathy was revealed to their partner
    // Include guesserUserId so mobile can filter - only the SUBJECT (non-guesser) should see validation_needed modal
    await notifyPartner(sessionId, userId, 'empathy.revealed', {
      direction: 'outgoing',
      guesserUserId: userId,
      forUserId: userId,
      empathyStatus: allStatuses[userId],
    });
  }

  console.log(`[Reconciler] Both empathy attempts revealed and notifications sent`);
  return true;
}
