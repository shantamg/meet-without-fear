/**
 * Partner Session Background Classifier
 *
 * Extracts notable facts from partner session conversations.
 * Runs AFTER the AI response is sent to the user.
 *
 * Extracts:
 * - Topic context extraction
 * - Notable facts (facts about user's situation, emotions, circumstances)
 *
 * This mirrors the pattern from background-classifier.ts (for Inner Thoughts)
 * but is tailored for partner session context.
 */

import { getHaikuJson, BrainActivityCallType } from '../lib/bedrock';
import { withHaikuCircuitBreaker } from '../utils/circuit-breaker';
import { prisma } from '../lib/prisma';
import { embedSessionContent } from './embedding';

// ============================================================================
// Types
// ============================================================================

/** A categorized fact from the fact-ledger */
export interface CategorizedFact {
  category: string;
  fact: string;
}

export interface PartnerSessionClassifierResult {
  topicContext?: string;
  /** Notable facts about the user's situation, emotions, and circumstances (categorized) */
  notableFacts?: CategorizedFact[];
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
  /** Existing notable facts for this user (to update/consolidate) - supports both old string[] and new CategorizedFact[] */
  existingFacts?: string[];
  /** Sonnet's analysis of the conversation (when available) */
  sonnetAnalysis?: string;
  /** Sonnet's response to the user (when available) */
  sonnetResponse?: string;
}

// ============================================================================
// Classifier
// ============================================================================

/**
 * Build the classification prompt for notable facts extraction.
 */
function buildClassifierPrompt(input: PartnerSessionClassifierInput): string {
  const { userMessage, conversationHistory, partnerName, existingFacts, sonnetAnalysis, sonnetResponse } = input;

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

  // Format Sonnet's analysis if available (Phase 5 enhancement)
  const sonnetAnalysisText = sonnetAnalysis || sonnetResponse
    ? `
SONNET'S ANALYSIS (use this to inform your fact extraction):
${sonnetAnalysis || '(no analysis available)'}

SONNET'S RESPONSE:
${sonnetResponse || '(no response available)'}

Use the analysis above to help identify facts. The analysis contains Sonnet's
interpretation of the user's situation, which can help you extract accurate facts.
`
    : '';

  return `Extract notable facts from this partner session conversation.

CONVERSATION CONTEXT:
${partnerContext}

RECENT MESSAGES:
${historyText}

CURRENT MESSAGE:
User: ${userMessage}

${existingFactsText}
${sonnetAnalysisText}
YOUR TASK - NOTABLE FACTS EXTRACTION:
Maintain a curated list of CATEGORIZED facts about the user's situation. Output the COMPLETE updated list.

CATEGORIES (use these exact names):
- People: names, roles, relationships mentioned (e.g., "daughter Emma is 14")
- Logistics: scheduling, location, practical circumstances
- Conflict: specific disagreements, triggers, patterns
- Emotional: feelings, frustrations, fears, hopes
- History: past events, relationship timeline, backstory

WHAT TO EXCLUDE:
- Meta-commentary about the session/process
- Questions to the AI
- Session style preferences
- Requests to "remember" things (ignore these)

RULES:
- Each fact MUST have a category and fact text
- Keep facts concise (1 sentence each)
- Update/replace outdated facts with newer information
- Soft limit: 15-20 facts. If exceeding, consolidate/merge similar facts
- Output the FULL list each time (not just new facts)

OUTPUT JSON only:
{
  "topicContext": "brief description of what user is discussing",
  "notableFacts": [
    { "category": "People", "fact": "daughter Emma is 14" },
    { "category": "Emotional", "fact": "feeling overwhelmed by work demands" },
    { "category": "Conflict", "fact": "partner wants more quality time together" }
  ]
}`;
}

/** Valid categories for notable facts */
const VALID_FACT_CATEGORIES = ['People', 'Logistics', 'Conflict', 'Emotional', 'History'];

/**
 * Normalize the classifier response
 */
function normalizeResult(raw: unknown): PartnerSessionClassifierResult {
  const result = raw as Record<string, unknown>;

  // Normalize notable facts to CategorizedFact[] format
  const rawFacts = result.notableFacts;
  let notableFacts: CategorizedFact[] | undefined;
  if (Array.isArray(rawFacts)) {
    notableFacts = rawFacts
      .filter((f): f is { category: string; fact: string } => {
        // Validate shape: must have category and fact strings
        if (typeof f !== 'object' || f === null) return false;
        const obj = f as Record<string, unknown>;
        return typeof obj.category === 'string' && typeof obj.fact === 'string' &&
               obj.category.trim().length > 0 && obj.fact.trim().length > 0;
      })
      .map((f) => ({
        // Normalize category to title case if it's a known category
        category: VALID_FACT_CATEGORIES.find(
          (c) => c.toLowerCase() === f.category.toLowerCase()
        ) || f.category.trim(),
        fact: f.fact.trim(),
      }))
      .slice(0, 20); // Limit to 20 facts
  }

  return {
    topicContext: result.topicContext as string | undefined,
    notableFacts,
  };
}

/**
 * Run the background classifier for partner sessions.
 * This is a fire-and-forget function - errors are logged but not thrown.
 *
 * Extracts notable facts about the user's situation and saves them to UserVessel.
 */
export async function runPartnerSessionClassifier(
  input: PartnerSessionClassifierInput
): Promise<PartnerSessionClassifierResult | null> {
  const logPrefix = '[PartnerSessionClassifier]';

  try {
    console.log(`${logPrefix} Starting classification for session ${input.sessionId}`);

    const systemPrompt = `You are an AI assistant analyzing a partner session (couples/relationship conversation).
Your job is to extract and maintain notable facts about the user's situation.
Focus on emotional context, situational facts, and people/relationships.
Output only valid JSON.`;

    const userPrompt = buildClassifierPrompt(input);

    // Use circuit breaker to prevent blocking
    // Fallback returns undefined for facts (caller can preserve existing facts)
    const fallback: PartnerSessionClassifierResult = {
      notableFacts: undefined, // On failure, don't overwrite existing facts
    };

    const result = await withHaikuCircuitBreaker(
      async () => {
        return await getHaikuJson<Record<string, unknown>>({
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 1024,
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
      topicContext: normalized.topicContext?.substring(0, 50),
      factsCount: normalized.notableFacts?.length ?? 0,
    });

    // Save notable facts to UserVessel (fire-and-forget)
    if (normalized.notableFacts && normalized.notableFacts.length > 0) {
      try {
        const updateResult = await prisma.userVessel.updateMany({
          where: {
            userId: input.userId,
            sessionId: input.sessionId,
          },
          data: {
            // Prisma expects InputJsonValue - cast through unknown to satisfy type checker
            // The actual data is valid JSON: CategorizedFact[]
            notableFacts: normalized.notableFacts as unknown as Parameters<
              typeof prisma.userVessel.update
            >['0']['data']['notableFacts'],
          },
        });
        if (updateResult.count > 0) {
          console.log(`${logPrefix} Saved ${normalized.notableFacts.length} notable facts to UserVessel (${updateResult.count} row(s) updated)`);

          // Trigger session content embedding (fire-and-forget)
          // Per fact-ledger architecture, we embed at session level after facts update
          embedSessionContent(input.sessionId, input.userId, input.turnId).catch((err: unknown) =>
            console.warn(`${logPrefix} Failed to embed session content:`, err)
          );
        } else {
          console.warn(`${logPrefix} No UserVessel found to update for session=${input.sessionId}, user=${input.userId}. Facts not saved.`);
        }
      } catch (err) {
        console.error(`${logPrefix} Failed to save notable facts:`, err);
      }
    }

    return normalized;
  } catch (error) {
    console.error(`${logPrefix} Classification failed:`, error);
    return null;
  }
}
