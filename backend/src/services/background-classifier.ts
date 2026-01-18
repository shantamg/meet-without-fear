/**
 * Background Classifier Service
 *
 * Consolidates multiple background Haiku calls into a single call for better
 * latency, cost, and coherence. Used by Inner Thoughts to run non-blocking
 * classification tasks after the response is sent.
 *
 * Consolidates:
 * - Memory intent detection
 * - Theme extraction for embedding
 * - Session metadata update (title, mood, topics)
 * - Summary update
 */

import { getHaikuJson, BrainActivityCallType } from '../lib/bedrock';
import { withHaikuCircuitBreaker } from '../utils/circuit-breaker';
import type { MemorySuggestion, MemoryCategory } from '@meet-without-fear/shared';
import { prisma } from '../lib/prisma';

// ============================================================================
// Types
// ============================================================================

export interface BackgroundClassifierResult {
  memoryIntent: {
    detected: boolean;
    suggestedMemory?: string;
    category?: MemoryCategory;
    confidence: 'high' | 'medium' | 'low';
    evidence?: string;
  };
  themes: string[];
  sessionMetadata: {
    title?: string;
    mood?: string;
    topics?: string[];
  };
  summary?: string;
}

export interface BackgroundClassifierInput {
  /** The user's message to analyze */
  userMessage: string;
  /** Recent conversation history for context */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Session ID for logging */
  sessionId: string;
  /** Turn ID for cost attribution */
  turnId: string;
  /** Current session title (if any) */
  currentTitle?: string;
  /** Current session summary (if any) */
  currentSummary?: string;
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
 */
function buildClassifierPrompt(input: BackgroundClassifierInput): string {
  const { userMessage, conversationHistory, currentTitle, currentSummary } = input;

  // Format conversation history
  const historyText = conversationHistory
    .slice(-5)
    .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n');

  return `Analyze this Inner Thoughts conversation and provide:

1. MEMORY INTENT: Only if user EXPLICITLY asks to remember something using words like "remember", "always", "from now on"
2. THEMES: 2-3 key themes being explored
3. SESSION METADATA: Title (if ${currentTitle ? 'needs update' : 'not yet set'}), mood, topics
4. SUMMARY: Brief 1-2 sentence summary of the session focus

CONVERSATION:
${historyText}

CURRENT MESSAGE:
User: ${userMessage}

${currentTitle ? `Current Title: ${currentTitle}` : ''}
${currentSummary ? `Current Summary: ${currentSummary}` : ''}

MEMORY INTENT RULES - BE CONSERVATIVE:
- ONLY detect if user uses explicit memory-request language: "remember", "always", "from now on", "going forward"
- DO NOT flag normal sharing of information, feelings, or preferences
- Categories: AI_NAME, LANGUAGE, COMMUNICATION, PERSONAL_INFO, RELATIONSHIP, PREFERENCE

OUTPUT JSON only:
{
  "memoryIntent": {
    "detected": boolean,
    "suggestedMemory": "what to remember (only if detected=true)",
    "category": "category (only if detected=true)",
    "confidence": "high|medium|low",
    "evidence": "quote from message (only if detected=true)"
  },
  "themes": ["theme1", "theme2"],
  "sessionMetadata": {
    "title": "short descriptive title or null",
    "mood": "emotional tone (e.g., anxious, reflective, processing)",
    "topics": ["topic1", "topic2"]
  },
  "summary": "Brief summary of what user is processing"
}`;
}

/**
 * Normalize the classifier response
 */
function normalizeResult(raw: unknown): BackgroundClassifierResult {
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
    },
    themes: Array.isArray(result.themes)
      ? (result.themes as string[]).filter((t): t is string => typeof t === 'string')
      : [],
    sessionMetadata: {
      title: (result.sessionMetadata as Record<string, unknown>)?.title as string | undefined,
      mood: (result.sessionMetadata as Record<string, unknown>)?.mood as string | undefined,
      topics: Array.isArray((result.sessionMetadata as Record<string, unknown>)?.topics)
        ? ((result.sessionMetadata as Record<string, unknown>)?.topics as string[]).filter(
            (t): t is string => typeof t === 'string'
          )
        : undefined,
    },
    summary: result.summary as string | undefined,
  };
}

/**
 * Run the consolidated background classifier.
 * This is a fire-and-forget function - errors are logged but not thrown.
 */
export async function runBackgroundClassifier(
  input: BackgroundClassifierInput
): Promise<BackgroundClassifierResult | null> {
  const logPrefix = '[BackgroundClassifier]';

  try {
    console.log(`${logPrefix} Starting classification for session ${input.sessionId}`);

    const systemPrompt = `You are an AI assistant analyzing an Inner Thoughts (self-reflection) session.
Your job is to extract themes, suggest session metadata, and detect ONLY explicit memory requests.
Be conservative with memory detection - most messages are NOT memory requests.
Output only valid JSON.`;

    const userPrompt = buildClassifierPrompt(input);

    // Use circuit breaker to prevent blocking
    const fallback: BackgroundClassifierResult = {
      memoryIntent: { detected: false, confidence: 'low' },
      themes: [],
      sessionMetadata: {},
    };

    const result = await withHaikuCircuitBreaker(
      async () => {
        return await getHaikuJson<Record<string, unknown>>({
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 512,
          sessionId: input.sessionId,
          turnId: input.turnId,
          operation: 'background-classifier',
          callType: BrainActivityCallType.BACKGROUND_CLASSIFICATION,
        });
      },
      null,
      'background-classifier'
    );

    if (!result) {
      console.warn(`${logPrefix} Haiku timed out or returned null`);
      return fallback;
    }

    const normalized = normalizeResult(result);
    console.log(`${logPrefix} Classification complete:`, {
      memoryDetected: normalized.memoryIntent.detected,
      themes: normalized.themes,
      hasMetadata: Boolean(normalized.sessionMetadata.title),
    });

    return normalized;
  } catch (error) {
    console.error(`${logPrefix} Classification failed:`, error);
    return null;
  }
}

/**
 * Apply the classifier results to the database.
 * Updates session metadata and potentially creates a memory suggestion.
 */
export async function applyClassifierResults(
  sessionId: string,
  results: BackgroundClassifierResult
): Promise<{ memorySuggestion?: MemorySuggestion }> {
  const output: { memorySuggestion?: MemorySuggestion } = {};

  try {
    // Update session metadata if we have new data
    const updateData: Record<string, string | null> = {};

    if (results.sessionMetadata.title) {
      updateData.title = results.sessionMetadata.title;
    }
    if (results.summary) {
      updateData.summary = results.summary;
    }
    if (results.themes.length > 0) {
      updateData.theme = results.themes[0];
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.innerWorkSession.update({
        where: { id: sessionId },
        data: updateData,
      });
    }

    // Create memory suggestion if detected
    if (results.memoryIntent.detected && results.memoryIntent.suggestedMemory && results.memoryIntent.category) {
      output.memorySuggestion = {
        suggestedContent: results.memoryIntent.suggestedMemory,
        category: results.memoryIntent.category,
        confidence: results.memoryIntent.confidence,
        evidence: results.memoryIntent.evidence || '',
      };
    }
  } catch (error) {
    console.error('[BackgroundClassifier] Failed to apply results:', error);
  }

  return output;
}
