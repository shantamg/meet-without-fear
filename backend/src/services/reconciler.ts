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
import { publishMessageAIResponse } from './realtime';
import { getCurrentUserId } from '../lib/request-context';
import { auditLog } from './audit-logger';
import {
  buildReconcilerPrompt,
  buildShareOfferPrompt,
  buildQuoteSelectionPrompt,
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
  QuoteSelectionResult,
  ShareOfferMessage,
  ReconcilerSummary,
} from '@meet-without-fear/shared';

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
  const conversationHistory = recentMessages.reverse().map(m => ({
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

  console.log(`[Reconciler] Generated continuation for stage ${currentStage}: "${response.substring(0, 50)}..."`);
  return response;
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
  const aReady = !aUnderstandingB || aUnderstandingB.recommendation.action === 'PROCEED';
  const bReady = !bUnderstandingA || bUnderstandingA.recommendation.action === 'PROCEED';
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
  empathyStatus: 'REVEALED' | 'AWAITING_SHARING';
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
  const hasSignificantGaps =
    result.gaps.severity === 'significant' ||
    result.recommendation.action === 'OFFER_SHARING';

  console.log(`[Reconciler] Outcome analysis: severity=${result.gaps.severity}, action=${result.recommendation.action}, significant=${hasSignificantGaps}`);

  if (!hasSignificantGaps) {
    // No significant gaps - reveal directly
    console.log(`[Reconciler] NO significant gaps. Revealing empathy directly for ${guesserInfo.name} → ${subjectInfo.name}`);
    const revealedNow = new Date();
    await prisma.empathyAttempt.updateMany({
      where: { sessionId, sourceUserId: guesserId },
      data: {
        status: 'REVEALED',
        revealedAt: revealedNow,
        deliveryStatus: 'DELIVERED',
        deliveredAt: revealedNow,
      },
    });

    // Create a message for the guesser explaining that the subject has shared their side
    // and is now considering the guesser's perspective
    const alignmentMessage = `${subjectInfo.name} has shared their side and is now considering how you might be feeling. Once they do, both of you will be able to reflect on what each other shared.`;

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

    return {
      result,
      empathyStatus: 'REVEALED',
      shareOffer: null,
    };
  }

  // Significant gaps - generate share suggestion for subject
  console.log(`[Reconciler] SIGNIFICANT gaps found. Generating share suggestion for ${subjectInfo.name}...`);
  const shareOffer = await generateShareSuggestion(
    sessionId,
    guesserInfo,
    subjectInfo,
    result,
    witnessingContent
  );

  // Update empathy attempt status to AWAITING_SHARING
  console.log(`[Reconciler] Updating empathy attempt status to AWAITING_SHARING for ${guesserInfo.name}`);
  await prisma.empathyAttempt.updateMany({
    where: { sessionId, sourceUserId: guesserId },
    data: { status: 'AWAITING_SHARING' },
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
 */
async function generateShareSuggestion(
  sessionId: string,
  guesser: UserInfo,
  subject: UserInfo,
  reconcilerResult: ReconcilerResult,
  witnessingContent: WitnessingContent
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
1. Be 1-3 sentences that ${subject.name} might actually say
2. Draw from what they actually shared (don't invent new content)
3. Address the most important gap in understanding
4. Feel natural and not forced

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
    console.warn(`[Reconciler] AI failed to generate share suggestion, using fallback`);
    // Fallback suggestion
    return {
      suggestedContent: `There's something about my experience that might help you understand better.`,
      reason: `${guesser.name} may have missed some important aspects of what you're going through.`,
    };
  }

  console.log(`[Reconciler] Share suggestion generated: "${response.suggestedContent.substring(0, 50)}..."`);
  console.log(`[Reconciler] Share reason: "${response.reason}"`);

  // Log the share suggestion for dashboard visibility (same turnId as COST log)
  await auditLog('RECONCILER', `Generated share suggestion for ${subject.name} to help ${guesser.name}`, {
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
  });

  // Save to reconciler result - retry up to 3 times to handle potential race condition
  // where the record might not be immediately visible after creation
  let dbResult = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[Reconciler] Looking up ReconcilerResult (attempt ${attempt}/3) for guesser=${guesser.id}, subject=${subject.id}`);
    dbResult = await prisma.reconcilerResult.findUnique({
      where: {
        sessionId_guesserId_subjectId: {
          sessionId,
          guesserId: guesser.id,
          subjectId: subject.id,
        },
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
    console.error(`[Reconciler] CRITICAL: Could not find reconcilerResult after 3 attempts! guesser=${guesser.id}, subject=${subject.id}, sessionId=${sessionId}`);
    console.error(`[Reconciler] This will cause the share suggestion to not be displayed to the user.`);
  }

  return response;
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
    console.log(`[Reconciler] User ${userId} declined share offer. Revealing guesser's empathy directly.`);

    // Log the decline for dashboard visibility
    await auditLog('RECONCILER', `Share suggestion declined - revealing empathy directly`, {
      sessionId,
      eventType: 'share_declined',
      subjectId: userId,
      guesserName: shareOffer.result.guesserName,
      subjectName: shareOffer.result.subjectName,
    });

    // User declined - mark offer as declined and reveal empathy as-is
    await prisma.reconcilerShareOffer.update({
      where: { id: shareOffer.id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
      },
    });

    // Reveal guesser's empathy statement
    const revealedNow = new Date();
    await prisma.empathyAttempt.updateMany({
      where: { sessionId, sourceUserId: shareOffer.result.guesserId },
      data: {
        status: 'REVEALED',
        revealedAt: revealedNow,
        deliveryStatus: 'DELIVERED',
        deliveredAt: revealedNow,
      },
    });

    // Delete the SHARE_SUGGESTION message now that user has responded
    await prisma.message.deleteMany({
      where: {
        sessionId,
        forUserId: userId,
        role: MessageRole.SHARE_SUGGESTION,
      },
    });
    console.log(`[Reconciler] Deleted SHARE_SUGGESTION message for user ${userId} (declined)`);

    return {
      status: 'declined',
      sharedContent: null,
      guesserUpdated: true,
    };
  }

  // User accepted or refined
  let sharedContent =
    response.action === 'refine' && response.refinedContent
      ? response.refinedContent
      : shareOffer.suggestedContent || '';

  // Fallback if suggestedContent was somehow empty
  if (!sharedContent.trim()) {
    console.warn(`[Reconciler] suggestedContent was empty for share offer ${shareOffer.id}, using fallback`);
    sharedContent = `There's something about my experience that might help you understand better.`;
  }

  console.log(`[Reconciler] User ${userId} ${response.action}ed share offer. Shared content: "${sharedContent.substring(0, 50)}..."`);

  // Log the share acceptance for dashboard visibility
  await auditLog('RECONCILER', `Share suggestion ${response.action}ed - context shared with guesser`, {
    sessionId,
    eventType: response.action === 'refine' ? 'share_refined' : 'share_accepted',
    subjectId: userId,
    guesserName: shareOffer.result.guesserName,
    subjectName: shareOffer.result.subjectName,
    sharedContent,
    wasRefined: response.action === 'refine',
    originalSuggestion: shareOffer.suggestedContent,
  });

  // Update share offer - set to DELIVERED since we're about to create the SHARED_CONTEXT message
  const now = new Date();
  await prisma.reconcilerShareOffer.update({
    where: { id: shareOffer.id },
    data: {
      status: 'ACCEPTED',
      refinedContent: response.action === 'refine' ? response.refinedContent : null,
      sharedContent,
      sharedAt: now,
      deliveryStatus: 'DELIVERED',
      deliveredAt: now,
    },
  });

  // Delete the SHARE_SUGGESTION message now that user has responded
  // This prevents it from appearing alongside the new EMPATHY_STATEMENT
  await prisma.message.deleteMany({
    where: {
      sessionId,
      forUserId: userId,
      role: MessageRole.SHARE_SUGGESTION,
    },
  });
  console.log(`[Reconciler] Deleted SHARE_SUGGESTION message for user ${userId}`);

  // Update guesser's empathy attempt to REFINING
  console.log(`[Reconciler] Updating guesser ${shareOffer.result.guesserId} empathy attempt to REFINING`);
  await prisma.empathyAttempt.updateMany({
    where: { sessionId, sourceUserId: shareOffer.result.guesserId },
    data: { status: 'REFINING' },
  });

  const subjectName = shareOffer.result.subjectName;
  const guesserName = shareOffer.result.guesserName;

  // Create AI message BEFORE the shared context (introduces what's coming)
  const introMessage = `Your empathy statement hasn't been shown to ${subjectName} yet because our internal reconciler found some gaps and got ${subjectName}'s consent to share the following:`;

  await prisma.message.create({
    data: {
      sessionId,
      senderId: null, // AI message
      forUserId: shareOffer.result.guesserId,
      role: 'AI',
      content: introMessage,
      stage: 2,
    },
  });

  // Create SHARED_CONTEXT message (the actual content shared by subject)
  await prisma.message.create({
    data: {
      sessionId,
      senderId: userId,
      forUserId: shareOffer.result.guesserId,
      role: MessageRole.SHARED_CONTEXT,
      content: sharedContent,
      stage: 2,
    },
  });

  // Create AI message AFTER the shared context (asks for reflection)
  const reflectionPromptMessage = `How does this land for you? Take a moment to reflect on what ${subjectName} shared. Does this give you any new insight into what they might be experiencing?`;

  await prisma.message.create({
    data: {
      sessionId,
      senderId: null, // AI message
      forUserId: shareOffer.result.guesserId,
      role: 'AI',
      content: reflectionPromptMessage,
      stage: 2,
    },
  });

  console.log(`[Reconciler] Created intro, shared context, and reflection messages for guesser ${shareOffer.result.guesserId}`);

  // Create message for subject showing what they shared (appears in their own chat)
  const sharedMessage = await prisma.message.create({
    data: {
      sessionId,
      senderId: userId,
      forUserId: userId, // For the subject's own chat
      role: MessageRole.EMPATHY_STATEMENT, // Reuse empathy statement styling for "what you shared"
      content: sharedContent,
      stage: 2,
    },
  });

  // Generate AI acknowledgment message for subject using their current stage context
  // This ensures the continuation picks up where their conversation left off
  // The AI generates the full message (acknowledgment + stage-appropriate continuation)
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

  await prisma.message.create({
    data: {
      sessionId,
      senderId: null, // AI message
      forUserId: userId, // For the subject
      role: 'AI',
      content: subjectAckMessage,
      stage: subjectCurrentStage,
    },
  });

  console.log(`[Reconciler] Created acknowledgment messages for subject ${userId}`);

  return {
    status: 'shared',
    sharedContent,
    guesserUpdated: true,
    sharedMessage: {
      id: sharedMessage.id,
      content: sharedMessage.content,
      stage: sharedMessage.stage,
      timestamp: sharedMessage.timestamp.toISOString(),
    },
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
    return { hasSharedContent: false, deliveryStatus: null, sharedAt: null };
  }

  const guesserId = shareOffer.result.guesserId;
  const sharedAt = shareOffer.sharedAt;

  // Check if the guesser has viewed the session after the content was shared
  const guesserVessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: {
        userId: guesserId,
        sessionId,
      },
    },
    select: {
      lastViewedAt: true,
    },
  });

  let deliveryStatus: 'pending' | 'delivered' | 'seen' = 'delivered';

  if (guesserVessel?.lastViewedAt && guesserVessel.lastViewedAt >= sharedAt) {
    // Guesser has viewed the session after the content was shared
    deliveryStatus = 'seen';
  }

  return {
    hasSharedContent: true,
    deliveryStatus,
    sharedAt: sharedAt.toISOString(),
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
  const existingResult = await prisma.reconcilerResult.findUnique({
    where: {
      sessionId_guesserId_subjectId: {
        sessionId: input.sessionId,
        guesserId: input.guesser.id,
        subjectId: input.subject.id,
      },
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
  await auditLog('RECONCILER', `Analyzed ${input.guesser.name}'s understanding of ${input.subject.name}`, {
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
  });

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
  quoteOptions: QuoteSelectionResult['options'];
  recommendedIndex: number | null;
  gapDescription: string;
} | null> {
  // Get the reconciler result for this direction
  const result = await prisma.reconcilerResult.findFirst({
    where: {
      sessionId,
      subjectId,
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

  // Get the subject's witnessing content for quote extraction
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

  // Generate the share offer message
  const shareOfferContext: ShareOfferContext = {
    userName,
    partnerName,
    gapSummary: result.gapSummary,
    mostImportantGap: result.mostImportantGap || result.gapSummary,
    relevantQuote: undefined, // Will be determined by quote selection
  };

  const [offerResult, quoteResult] = await Promise.all([
    getSonnetJson<ShareOfferMessage>({
      systemPrompt: buildShareOfferPrompt(shareOfferContext),
      messages: [{ role: 'user', content: 'Generate the share offer message.' }],
      maxTokens: 512,
      sessionId,
      operation: 'reconciler-share-offer',
    }),
    getSonnetJson<QuoteSelectionResult>({
      systemPrompt: buildQuoteSelectionPrompt({
        userName,
        partnerName,
        gapDescription: result.mostImportantGap || result.gapSummary,
        witnessingTranscript: witnessingContent.userMessages,
      }),
      messages: [{ role: 'user', content: 'Extract shareable quotes.' }],
      maxTokens: 1024,
      sessionId,
      operation: 'reconciler-quote-selection',
    }),
  ]);

  if (!offerResult) {
    console.warn(`[Reconciler] Failed to generate share offer message`);
    return null;
  }

  // Create or update share offer record
  const quoteOptions = quoteResult?.options || [];
  const recommendedIndex = quoteResult?.noGoodOptions ? null : 0;

  await prisma.reconcilerShareOffer.upsert({
    where: { resultId: result.id },
    create: {
      resultId: result.id,
      userId: subjectId,
      status: 'OFFERED',
      offerMessage: offerResult.message,
      quoteOptions: quoteOptions,
      recommendedQuote: recommendedIndex,
    },
    update: {
      status: 'OFFERED',
      offerMessage: offerResult.message,
      quoteOptions: quoteOptions,
      recommendedQuote: recommendedIndex,
    },
  });

  return {
    offerMessage: offerResult.message,
    quoteOptions,
    recommendedIndex,
    gapDescription: result.mostImportantGap || result.gapSummary,
  };
}

/**
 * Respond to a share offer (accept, decline, or skip).
 */
export async function respondToShareOffer(
  sessionId: string,
  userId: string,
  response: {
    accept: boolean;
    selectedQuoteIndex?: number;
    customContent?: string;
  }
): Promise<{
  status: 'ACCEPTED' | 'DECLINED';
  sharedContent: string | null;
  confirmationMessage: string;
}> {
  // Get the share offer for this user
  const shareOffer = await prisma.reconcilerShareOffer.findFirst({
    where: {
      userId,
      result: { sessionId },
      status: 'OFFERED',
    },
    include: {
      result: true,
    },
  });

  if (!shareOffer) {
    throw new Error('No pending share offer found');
  }

  if (response.accept) {
    // Determine what content to share
    let sharedContent: string;

    if (response.customContent) {
      sharedContent = response.customContent;
    } else if (
      response.selectedQuoteIndex !== undefined &&
      shareOffer.quoteOptions &&
      Array.isArray(shareOffer.quoteOptions)
    ) {
      const options = shareOffer.quoteOptions as Array<{ content: string }>;
      if (options[response.selectedQuoteIndex]) {
        sharedContent = options[response.selectedQuoteIndex].content;
      } else {
        throw new Error('Invalid quote index');
      }
    } else {
      throw new Error('No content provided to share');
    }

    // Update the share offer
    await prisma.reconcilerShareOffer.update({
      where: { id: shareOffer.id },
      data: {
        status: 'ACCEPTED',
        sharedContent,
        sharedAt: new Date(),
      },
    });

    // Create a message in the chat for the partner to see
    await prisma.message.create({
      data: {
        sessionId,
        senderId: userId,
        forUserId: shareOffer.result.guesserId, // Show to the guesser
        role: 'USER',
        content: `[Additional context shared] ${sharedContent}`,
        stage: 2,
      },
    });

    return {
      status: 'ACCEPTED',
      sharedContent,
      confirmationMessage: "Thanks for sharing that. It's been sent to help them understand you better.",
    };
  } else {
    // Update as declined
    await prisma.reconcilerShareOffer.update({
      where: { id: shareOffer.id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
      },
    });

    return {
      status: 'DECLINED',
      sharedContent: null,
      confirmationMessage: "No problem at all. You've shared what feels right, and that's perfect.",
    };
  }
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
    where: { sessionId },
    include: { shareOffer: true },
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
    where: { sessionId },
    include: { shareOffer: true },
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
