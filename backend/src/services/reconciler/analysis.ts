/**
 * Reconciler Analysis Module
 *
 * Core AI gap analysis: analyzes the gap between what one person guessed
 * about the other's feelings vs what they actually expressed.
 */

import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { MessageRole } from '@meet-without-fear/shared';
import { getSonnetResponse, getHaikuJson } from '../../lib/bedrock';
import { BrainActivityCallType } from '@prisma/client';
import { getCurrentUserId } from '../../lib/request-context';
import {
  buildReconcilerPrompt,
  type ReconcilerContext,
} from '../stage-prompts';
import { extractJsonFromResponse } from '../../utils/json-extractor';
import type {
  ReconcilerResult,
} from '@meet-without-fear/shared';

// ============================================================================
// Types (shared across reconciler modules)
// ============================================================================

export interface UserInfo {
  id: string;
  name: string;
}

export interface SessionParticipants {
  userA: UserInfo;
  userB: UserInfo;
}

export interface WitnessingContent {
  /** Combined user messages from Stage 1 */
  userMessages: string;
  /** Key themes/feelings extracted */
  themes: string[];
}

export interface EmpathyData {
  /** The empathy statement they shared */
  statement: string;
  /** When it was shared */
  sharedAt: Date;
}

export interface ReconcilerAnalysisInput {
  sessionId: string;
  guesser: UserInfo;
  subject: UserInfo;
  empathyStatement: string;
  witnessingContent: WitnessingContent;
}

// ============================================================================
// Helper: Get Sonnet JSON response (shared across reconciler modules)
// ============================================================================

/**
 * Get a JSON response from Sonnet, parsing the result.
 */
export async function getSonnetJson<T>(options: {
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

  logger.debug('Starting AI request', { operation: effectiveOperation });

  const response = await getSonnetResponse({
    ...options,
    sessionId: effectiveSessionId,
    turnId: effectiveTurnId,
    operation: effectiveOperation,
    callType: BrainActivityCallType.RECONCILER_ANALYSIS,
  });

  if (!response) {
    logger.warn('No AI response received', { operation: effectiveOperation });
    return null;
  }

  try {
    const json = extractJsonFromResponse(response) as T;
    logger.debug('Parsed AI JSON response', { operation: effectiveOperation });
    return json;
  } catch (error) {
    logger.warn('Failed to parse AI JSON response', { operation: effectiveOperation, error: (error as Error).message, rawResponse: response });
    return null;
  }
}

// ============================================================================
// Helper: Get empathy data (shared across reconciler modules)
// ============================================================================

/**
 * Get empathy data for a user (their shared empathy statement).
 */
export async function getEmpathyData(
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

// ============================================================================
// Helper: Get witnessing content (shared across reconciler modules)
// ============================================================================

/**
 * Get witnessing content for a user (their Stage 1 messages).
 */
export async function getWitnessingContent(
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

// ============================================================================
// Abstract Guidance
// ============================================================================

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
  // e.g., ["unappreciated", "unseen at work"] -> "work and effort"
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

// ============================================================================
// DB Result Conversion (shared across reconciler modules)
// ============================================================================

/**
 * Convert database result to ReconcilerResult type.
 */
export function dbResultToReconcilerResult(
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
export function getDefaultReconcilerResult(): ReconcilerResult {
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
// Core Analysis Function
// ============================================================================

/**
 * Analyze the empathy gap for one direction (guesser -> subject).
 */
export async function analyzeEmpathyGap(
  input: ReconcilerAnalysisInput
): Promise<ReconcilerResult> {
  logger.info('Analyzing empathy gap', {
    guesser: input.guesser.name,
    subject: input.subject.name,
    empathyPreview: input.empathyStatement.substring(0, 100),
    themes: input.witnessingContent.themes,
  });

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
    logger.info('Using cached reconciler result', { guesser: input.guesser.name, subject: input.subject.name });
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
  logger.debug('Built analysis prompt', { promptLength: prompt.length });

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
    logger.warn('AI analysis failed, using fallback result');
    return getDefaultReconcilerResult();
  }

  logger.info('AI analysis complete', {
    alignmentScore: result.alignment.score,
    gapSeverity: result.gaps.severity,
    missedFeelings: result.gaps.missedFeelings.length,
    action: result.recommendation.action,
  });

  // Generate abstract guidance for refinement (doesn't expose partner's specific content)
  const abstractGuidance = generateAbstractGuidance(result);

  // Save result to database with abstract guidance fields
  logger.debug('Saving reconciler result to database', { guesser: input.guesser.name, subject: input.subject.name });
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

  logger.info('Reconciler analysis saved', {
    alignmentScore: result.alignment.score,
    gapSeverity: result.gaps.severity,
    action: result.recommendation.action,
  });

  return result;
}

// ============================================================================
// Main Function: runReconciler
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
  logger.info('Starting reconciliation', { sessionId });

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
