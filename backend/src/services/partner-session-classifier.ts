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
 *
 * This mirrors the pattern from background-classifier.ts (for Inner Thoughts)
 * but is tailored for partner session context.
 */

import { getHaikuJson } from '../lib/bedrock';
import { withHaikuCircuitBreaker } from '../utils/circuit-breaker';
import type { MemoryCategory } from '@meet-without-fear/shared';
import { publishUserEvent } from './realtime';
import { memoryService } from './memory-service';

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
 * Combines memory detection AND validation in one call.
 */
function buildClassifierPrompt(input: PartnerSessionClassifierInput): string {
  const { userMessage, conversationHistory, partnerName } = input;

  // Format conversation history
  const historyText = conversationHistory
    .slice(-5)
    .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n');

  const partnerContext = partnerName ? `Partner name: ${partnerName}` : '';

  return `Analyze this partner session conversation for memory intents.

CONVERSATION CONTEXT:
${partnerContext}

RECENT MESSAGES:
${historyText}

CURRENT MESSAGE:
User: ${userMessage}

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
  "topicContext": "brief description of what user is discussing"
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
Your job is to detect ONLY explicit memory requests and validate them if found.
Be conservative with memory detection - most messages are NOT memory requests.
Output only valid JSON.`;

    const userPrompt = buildClassifierPrompt(input);

    // Use circuit breaker to prevent blocking
    const fallback: PartnerSessionClassifierResult = {
      memoryIntent: { detected: false, confidence: 'low' },
    };

    const result = await withHaikuCircuitBreaker(
      async () => {
        return await getHaikuJson<Record<string, unknown>>({
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 512,
          sessionId: input.sessionId,
          turnId: input.turnId,
          operation: 'partner-session-classifier',
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
    });

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
