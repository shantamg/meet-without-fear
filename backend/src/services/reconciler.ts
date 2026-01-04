/**
 * Empathy Reconciler Service
 *
 * Analyzes the gap between what one person guessed about the other's feelings
 * vs what they actually expressed. This runs after both users complete Stage 2
 * to identify opportunities for deeper understanding through targeted sharing.
 *
 * Flow:
 * 1. Both users complete Stage 2 (share empathy statements)
 * 2. Reconciler runs for each direction (A→B and B→A)
 * 3. For each direction, compare empathy guess vs actual witnessing content
 * 4. If gaps exist, offer the subject a chance to share more
 * 5. Once reconciliation is complete, proceed to Stage 3
 */

import { prisma } from '../lib/prisma';
import { getSonnetResponse, getHaikuJson } from '../lib/bedrock';
import {
  buildReconcilerPrompt,
  buildShareOfferPrompt,
  buildQuoteSelectionPrompt,
  buildReconcilerSummaryPrompt,
  type ReconcilerContext,
  type ShareOfferContext,
  type QuoteSelectionContext,
  type ReconcilerSummaryContext,
} from './stage-prompts';
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
}): Promise<T | null> {
  const response = await getSonnetResponse(options);
  if (!response) return null;

  try {
    return extractJsonFromResponse(response) as T;
  } catch (error) {
    console.warn('[Reconciler] Failed to parse JSON response:', error);
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
 * Analyze the empathy gap for one direction (guesser → subject).
 */
async function analyzeEmpathyGap(
  input: ReconcilerAnalysisInput
): Promise<ReconcilerResult> {
  console.log(
    `[Reconciler] Analyzing ${input.guesser.name}'s understanding of ${input.subject.name}`
  );

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

  // Build context for the AI prompt
  const context: ReconcilerContext = {
    guesserName: input.guesser.name,
    subjectName: input.subject.name,
    empathyStatement: input.empathyStatement,
    witnessingContent: input.witnessingContent.userMessages,
    extractedThemes: input.witnessingContent.themes,
  };

  const prompt = buildReconcilerPrompt(context);

  // Call AI to analyze the gap
  const result = await getSonnetJson<ReconcilerResult>({
    systemPrompt: prompt,
    messages: [{ role: 'user', content: 'Analyze the empathy gap and provide your assessment.' }],
    maxTokens: 2048,
  });

  if (!result) {
    // Fallback result if AI fails
    console.warn(`[Reconciler] AI analysis failed, using fallback`);
    return getDefaultReconcilerResult();
  }

  // Save result to database
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
    },
  });

  console.log(
    `[Reconciler] Analysis complete: ${result.alignment.score}% alignment, ` +
    `${result.gaps.severity} gaps, action: ${result.recommendation.action}`
  );

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
    themesList = await extractThemes(userMessages);
  }

  return {
    userMessages,
    themes: themesList,
  };
}

/**
 * Extract key themes from witnessing content using AI.
 */
async function extractThemes(content: string): Promise<string[]> {
  const result = await getHaikuJson<{ themes: string[] }>({
    systemPrompt: `Extract 3-5 key emotional themes or feelings from this witnessing content. Return as JSON: {"themes": ["theme1", "theme2", ...]}`,
    messages: [{ role: 'user', content }],
    maxTokens: 256,
  });

  return result?.themes || [];
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
