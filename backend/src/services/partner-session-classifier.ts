/**
 * Partner Session Background Classifier
 *
 * Consolidates multiple background Haiku calls into a single call for better
 * latency, cost, and coherence. Runs AFTER the AI response is sent to the user.
 *
 * Consolidates:
 * - Memory intent detection (user wants to save a memory)
 * - Memory validation (is the memory appropriate to save)
 * - Topic context extraction
 * - Notable facts extraction (facts about user's situation, emotions, circumstances)
 *
 * This mirrors the pattern from background-classifier.ts (for Inner Thoughts)
 * but is tailored for partner session context.
 */

import { getHaikuJson, BrainActivityCallType } from '../lib/bedrock';
import { withHaikuCircuitBreaker } from '../utils/circuit-breaker';
import type { MemoryCategory } from '@meet-without-fear/shared';
import { publishUserEvent } from './realtime';
import { memoryService } from './memory-service';
import { prisma } from '../lib/prisma';

// ============================================================================
// Types
// ============================================================================

export interface PartnerSessionClassifierResult {
  memoryIntent: {
    detected: boolean;
    suggestedMemory?: string;
    category?: MemoryCategory;
    confidence: 'high' | 'medium' | 'low';
    evidence?: string;
    isValid?: boolean;
    validationReason?: string;
  };
  topicContext?: string;
  /** Notable facts about the user's situation, emotions, and circumstances */
  notableFacts?: string[];
}

export interface PartnerSessionClassifierInput {
  /** The user's message to analyze */
  userMessage: string;
  /** Recent conversation history for context */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Session ID for logging */
  sessionId: string;
  /** User ID for publishing suggestions */
  userId: string;
  /** Turn ID for cost attribution */
  turnId: string;
  /** Partner's name for context */
  partnerName?: string;
  /** Existing notable facts for this user (to update/consolidate) */
  existingFacts?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const VALID_CATEGORIES: MemoryCategory[] = [
  'AI_NAME',
  'LANGUAGE',
  'COMMUNICATION',
  'PERSONAL_INFO',
  'RELATIONSHIP',
  'PREFERENCE',
];

// ============================================================================
// Classifier
// ============================================================================

/**
 * Build the unified classification prompt.
 * Combines memory detection, validation, and notable facts extraction in one call.
 */
function buildClassifierPrompt(input: PartnerSessionClassifierInput): string {
  const { userMessage, conversationHistory, partnerName, existingFacts } = input;

  // Format conversation history
  const historyText = conversationHistory
    .slice(-5)
    .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n');

  const partnerContext = partnerName ? `Partner name: ${partnerName}` : '';

  // Format existing facts if any
  const existingFactsText = existingFacts && existingFacts.length > 0
    ? `CURRENT NOTABLE FACTS:\n${existingFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    : 'CURRENT NOTABLE FACTS: (none yet)';

  return `Analyze this partner session conversation for memory intents and notable facts.

CONVERSATION CONTEXT:
${partnerContext}

RECENT MESSAGES:
${historyText}

CURRENT MESSAGE:
User: ${userMessage}

${existingFactsText}

TASK 1 - MEMORY INTENT DETECTION:
Only flag as detected=true if user EXPLICITLY asks to remember something using words like:
- "remember", "always", "from now on", "going forward", "don't forget"
- "I want you to know that...", "Keep in mind that..."

DO NOT flag normal sharing, venting, or conversational statements.

Categories: AI_NAME, LANGUAGE, COMMUNICATION, PERSONAL_INFO, RELATIONSHIP, PREFERENCE

TASK 2 - MEMORY VALIDATION (only if detected=true):
Check if the memory is appropriate to save:
- Is it safe (no harmful content, no secrets, no personally identifying info about third parties)?
- Is it therapeutically appropriate (not reinforcing negative patterns)?
- Is it something that should persist across sessions?

TASK 3 - NOTABLE FACTS EXTRACTION:
Maintain a curated list of facts about the user's situation. Output the COMPLETE updated list.

WHAT TO INCLUDE:
- Emotional context: feelings, frustrations, fears, hopes
- Situational facts: events, circumstances, timeline of conflict
- People & relationships: names, roles, relationships mentioned (e.g., "daughter Emma is 14")

WHAT TO EXCLUDE:
- Meta-commentary about the session/process
- Questions to the AI
- Session style preferences

RULES:
- Keep facts concise (1 sentence each)
- Update/replace outdated facts with newer information
- Soft limit: 15-20 facts. If exceeding, consolidate/merge similar facts
- Output the FULL list each time (not just new facts)

OUTPUT JSON only:
{
  "memoryIntent": {
    "detected": boolean,
    "suggestedMemory": "what to remember (only if detected=true)",
    "category": "CATEGORY (only if detected=true)",
    "confidence": "high|medium|low",
    "evidence": "quote from message (only if detected=true)",
    "isValid": boolean (only if detected=true - result of validation),
    "validationReason": "why invalid (only if detected=true and isValid=false)"
  },
  "topicContext": "brief description of what user is discussing",
  "notableFacts": ["fact 1", "fact 2", "..."]
}`;
}

/**
 * Normalize the classifier response
 */
function normalizeResult(raw: unknown): PartnerSessionClassifierResult {
  const result = raw as Record<string, unknown>;

  // Normalize memory intent
  const memoryIntent = result.memoryIntent as Record<string, unknown> | undefined;
  const category = memoryIntent?.category as string | undefined;
  const normalizedCategory = category && VALID_CATEGORIES.includes(category.toUpperCase() as MemoryCategory)
    ? (category.toUpperCase() as MemoryCategory)
    : undefined;

  // Normalize notable facts
  const rawFacts = result.notableFacts;
  let notableFacts: string[] | undefined;
  if (Array.isArray(rawFacts)) {
    // Filter to only valid non-empty strings, limit to 20 facts
    notableFacts = rawFacts
      .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
      .map((f) => f.trim())
      .slice(0, 20);
  }

  return {
    memoryIntent: {
      detected: Boolean(memoryIntent?.detected),
      suggestedMemory: memoryIntent?.suggestedMemory as string | undefined,
      category: normalizedCategory,
      confidence: (['high', 'medium', 'low'].includes(memoryIntent?.confidence as string)
        ? memoryIntent?.confidence
        : 'low') as 'high' | 'medium' | 'low',
      evidence: memoryIntent?.evidence as string | undefined,
      isValid: memoryIntent?.isValid as boolean | undefined,
      validationReason: memoryIntent?.validationReason as string | undefined,
    },
    topicContext: result.topicContext as string | undefined,
    notableFacts,
  };
}

/**
 * Run the consolidated background classifier for partner sessions.
 * This is a fire-and-forget function - errors are logged but not thrown.
 *
 * If a valid memory intent is detected, it creates a pending memory and
 * publishes the suggestion via Ably.
 */
export async function runPartnerSessionClassifier(
  input: PartnerSessionClassifierInput
): Promise<PartnerSessionClassifierResult | null> {
  const logPrefix = '[PartnerSessionClassifier]';

  try {
    console.log(`${logPrefix} Starting classification for session ${input.sessionId}`);

    const systemPrompt = `You are an AI assistant analyzing a partner session (couples/relationship conversation).
Your job is to:
1. Detect ONLY explicit memory requests and validate them if found
2. Extract and maintain notable facts about the user's situation

Be conservative with memory detection - most messages are NOT memory requests.
For notable facts, focus on emotional context, situational facts, and people/relationships.
Output only valid JSON.`;

    const userPrompt = buildClassifierPrompt(input);

    // Use circuit breaker to prevent blocking
    const fallback: PartnerSessionClassifierResult = {
      memoryIntent: { detected: false, confidence: 'low' },
      notableFacts: input.existingFacts, // Preserve existing facts on failure
    };

    const result = await withHaikuCircuitBreaker(
      async () => {
        return await getHaikuJson<Record<string, unknown>>({
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 1024, // Increased to accommodate notable facts
          sessionId: input.sessionId,
          turnId: input.turnId,
          operation: 'partner-session-classifier',
          callType: BrainActivityCallType.PARTNER_SESSION_CLASSIFICATION,
        });
      },
      null,
      'partner-session-classifier'
    );

    if (!result) {
      console.warn(`${logPrefix} Haiku timed out or returned null`);
      return fallback;
    }

    const normalized = normalizeResult(result);
    console.log(`${logPrefix} Classification complete:`, {
      memoryDetected: normalized.memoryIntent.detected,
      memoryValid: normalized.memoryIntent.isValid,
      topicContext: normalized.topicContext?.substring(0, 50),
      factsCount: normalized.notableFacts?.length ?? 0,
    });

    // Save notable facts to UserVessel (fire-and-forget)
    if (normalized.notableFacts && normalized.notableFacts.length > 0) {
      try {
        await prisma.userVessel.updateMany({
          where: {
            userId: input.userId,
            sessionId: input.sessionId,
          },
          data: {
            notableFacts: normalized.notableFacts,
          },
        });
        console.log(`${logPrefix} Saved ${normalized.notableFacts.length} notable facts to UserVessel`);
      } catch (err) {
        console.error(`${logPrefix} Failed to save notable facts:`, err);
      }
    }

    // If valid memory intent detected, create pending memory and publish via Ably
    if (
      normalized.memoryIntent.detected &&
      normalized.memoryIntent.isValid &&
      normalized.memoryIntent.suggestedMemory &&
      normalized.memoryIntent.category
    ) {
      try {
        const memory = await memoryService.createPendingMemory({
          userId: input.userId,
          content: normalized.memoryIntent.suggestedMemory,
          category: normalized.memoryIntent.category,
          suggestedBy: `AI Confidence: ${normalized.memoryIntent.confidence} | Evidence: ${normalized.memoryIntent.evidence}`,
        });

        await publishUserEvent(input.userId, 'memory.suggested', {
          sessionId: input.sessionId,
          suggestion: {
            id: memory.id,
            suggestedContent: normalized.memoryIntent.suggestedMemory,
            category: normalized.memoryIntent.category,
            confidence: normalized.memoryIntent.confidence,
            evidence: normalized.memoryIntent.evidence,
            validation: 'valid',
          },
        });

        console.log(`${logPrefix} Memory suggestion published via Ably: ${memory.id}`);
      } catch (err) {
        console.error(`${logPrefix} Failed to create/publish memory suggestion:`, err);
      }
    } else if (normalized.memoryIntent.detected && !normalized.memoryIntent.isValid) {
      console.log(`${logPrefix} Memory detected but invalid: ${normalized.memoryIntent.validationReason}`);
    }

    return normalized;
  } catch (error) {
    console.error(`${logPrefix} Classification failed:`, error);
    return null;
  }
}
