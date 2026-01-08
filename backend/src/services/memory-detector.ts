/**
 * Memory Detector Service
 *
 * Uses Haiku to detect implicit memory requests in user messages.
 * Detects patterns like "I'll call you X", language preferences,
 * communication style preferences, and relationship context.
 */

import { getHaikuJson } from '../lib/bedrock';
import type { MemoryDetectionResult, MemoryCategory } from 'shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw detection result from Haiku (matches expected JSON output)
 */
interface HaikuDetectionResponse {
  hasMemoryIntent: boolean;
  suggestions: Array<{
    suggestedContent: string;
    category: string;
    scope: string;
    confidence: string;
    evidence: string;
  }>;
  topicContext: string;
}

// ============================================================================
// Detection Prompt
// ============================================================================

/**
 * Build the detection prompt for Haiku
 */
function buildDetectionPrompt(message: string): string {
  return `Analyze this message for implicit memory requests - things the user wants remembered.

DETECT PATTERNS:
- AI_NAME: "I'll call you X", "Can I call you Y"
- LANGUAGE: Message in different language than conversation
- COMMUNICATION: "Shorter responses", "more casual", "be direct"
- PERSONAL_INFO: "Call me X", "I use X pronouns"
- RELATIONSHIP: "My partner's name is X", relationship facts
- PREFERENCE: "Don't use analogies", "Give examples"

SCOPE:
- global: Style, name, language, personal info, communication
- session: Relationship facts, partner details

User message: "${escapeForPrompt(message)}"

OUTPUT JSON only (no markdown):
{
  "hasMemoryIntent": boolean,
  "suggestions": [
    {
      "suggestedContent": "Remember to...",
      "category": "AI_NAME|LANGUAGE|COMMUNICATION|PERSONAL_INFO|RELATIONSHIP|PREFERENCE",
      "scope": "global|session",
      "confidence": "high|medium|low",
      "evidence": "What in the message suggests this"
    }
  ],
  "topicContext": "What user was discussing (for returning to topic)"
}`;
}

/**
 * Escape special characters for prompt inclusion
 */
function escapeForPrompt(text: string): string {
  return text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ============================================================================
// Category Validation
// ============================================================================

const VALID_CATEGORIES: MemoryCategory[] = [
  'AI_NAME',
  'LANGUAGE',
  'COMMUNICATION',
  'PERSONAL_INFO',
  'RELATIONSHIP',
  'PREFERENCE',
];

const VALID_SCOPES = ['global', 'session'] as const;
const VALID_CONFIDENCES = ['high', 'medium', 'low'] as const;

/**
 * Validate and normalize a category string to MemoryCategory
 */
function normalizeCategory(category: string): MemoryCategory | null {
  const upper = category.toUpperCase();
  if (VALID_CATEGORIES.includes(upper as MemoryCategory)) {
    return upper as MemoryCategory;
  }
  return null;
}

/**
 * Validate and normalize scope
 */
function normalizeScope(scope: string): 'global' | 'session' {
  const lower = scope.toLowerCase();
  if (VALID_SCOPES.includes(lower as typeof VALID_SCOPES[number])) {
    return lower as 'global' | 'session';
  }
  // Default to global for unknown scopes
  return 'global';
}

/**
 * Validate and normalize confidence
 */
function normalizeConfidence(confidence: string): 'high' | 'medium' | 'low' {
  const lower = confidence.toLowerCase();
  if (VALID_CONFIDENCES.includes(lower as typeof VALID_CONFIDENCES[number])) {
    return lower as 'high' | 'medium' | 'low';
  }
  // Default to medium for unknown confidence
  return 'medium';
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect memory intent in a user message using Haiku.
 *
 * @param message - The user's message to analyze
 * @param sessionId - Optional session ID for context (not used in current implementation)
 * @param context - Optional context label for logging (e.g., 'partner-session', 'inner-thoughts')
 * @returns Detection result with any memory suggestions found
 */
export async function detectMemoryIntent(
  message: string,
  sessionId?: string,
  turnId?: string,
  context: string = 'unknown'
): Promise<MemoryDetectionResult> {
  const logPrefix = `[Memory Detector][${context}]`;

  // Skip detection for null/undefined/very short messages
  if (!message || message.trim().length < 3) {
    console.log(`${logPrefix} Skipping - message missing or too short (${message?.trim().length || 0} chars)`);
    return {
      hasMemoryIntent: false,
      suggestions: [],
      topicContext: '',
    };
  }

  console.log(`${logPrefix} Starting detection for message (${message.length} chars): "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

  const systemPrompt = `You are a memory detection assistant. Analyze messages for implicit memory requests.
Output only valid JSON with no markdown formatting or extra text.`;

  const userPrompt = buildDetectionPrompt(message);

  console.log(`${logPrefix} Sending to Haiku...`);

  try {
    const response = await getHaikuJson<HaikuDetectionResponse>({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 512,
      sessionId,
      turnId,
      operation: 'memory-detection',
    });

    console.log(`${logPrefix} Haiku raw response:`, JSON.stringify(response, null, 2));

    if (!response) {
      console.warn(`${logPrefix} Haiku returned null, no memory detected`);
      return {
        hasMemoryIntent: false,
        suggestions: [],
        topicContext: '',
      };
    }

    // Validate and normalize the response
    const result = normalizeDetectionResult(response);

    console.log(`${logPrefix} Detection result:`, {
      hasMemoryIntent: result.hasMemoryIntent,
      suggestionCount: result.suggestions.length,
      suggestions: result.suggestions.map(s => ({
        category: s.category,
        content: s.suggestedContent,
        confidence: s.confidence,
        scope: s.scope,
      })),
      topicContext: result.topicContext,
    });

    return result;
  } catch (error) {
    console.error(`${logPrefix} Error detecting memory intent:`, error);
    return {
      hasMemoryIntent: false,
      suggestions: [],
      topicContext: '',
    };
  }
}

/**
 * Normalize and validate the raw detection result from Haiku
 */
function normalizeDetectionResult(raw: HaikuDetectionResponse): MemoryDetectionResult {
  const validSuggestions = (raw.suggestions || [])
    .map((suggestion) => {
      const category = normalizeCategory(suggestion.category);
      if (!category) {
        console.warn('[Memory Detector] Invalid category:', suggestion.category);
        return null;
      }

      return {
        suggestedContent: suggestion.suggestedContent || '',
        category,
        scope: normalizeScope(suggestion.scope),
        confidence: normalizeConfidence(suggestion.confidence),
        evidence: suggestion.evidence || '',
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return {
    hasMemoryIntent: raw.hasMemoryIntent === true && validSuggestions.length > 0,
    suggestions: validSuggestions,
    topicContext: raw.topicContext || '',
  };
}

// ============================================================================
// Mock Detection (for testing without Haiku)
// ============================================================================

/**
 * Pattern-based fallback detection for when Haiku is unavailable.
 * This is a simple heuristic-based approach.
 */
export function detectMemoryIntentMock(message: string): MemoryDetectionResult {
  const suggestions: MemoryDetectionResult['suggestions'] = [];
  const lowerMessage = message.toLowerCase();

  // AI_NAME patterns
  const callMeMatch = message.match(/(?:call you|i'll call you|can i call you)\s+["']?(\w+)["']?/i);
  if (callMeMatch) {
    suggestions.push({
      suggestedContent: `The user wants to call the AI "${callMeMatch[1]}"`,
      category: 'AI_NAME',
      scope: 'global',
      confidence: 'high',
      evidence: callMeMatch[0],
    });
  }

  // PERSONAL_INFO patterns - match name introductions
  // "call me X", "my name is X", "I'm X" (where X is a proper name, not a state like "feeling")
  const callMeNameMatch = message.match(/call me\s+["']?([A-Z][a-zA-Z]+)["']?/i);
  const myNameIsMatch = message.match(/my name is\s+["']?([A-Z][a-zA-Z]+)["']?/i);
  // For "I'm X" or "I am X", only match if followed by a capitalized name (likely a proper noun)
  const iAmMatch = message.match(/(?:i'm|i am)\s+([A-Z][a-z]+)(?:\s|$|[.,!?])/);

  const nameMatch = callMeNameMatch || myNameIsMatch || iAmMatch;
  if (nameMatch && !lowerMessage.includes('call you')) {
    suggestions.push({
      suggestedContent: `The user's name is ${nameMatch[1]}`,
      category: 'PERSONAL_INFO',
      scope: 'global',
      confidence: 'high',
      evidence: nameMatch[0],
    });
  }

  // Pronoun patterns - match various ways to express pronoun preferences
  const pronounMatch = message.match(/(?:use|my|i prefer|pronouns are|pronouns:?)\s*(he\/him|she\/her|they\/them)/i);
  if (pronounMatch) {
    suggestions.push({
      suggestedContent: `The user uses ${pronounMatch[1]} pronouns`,
      category: 'PERSONAL_INFO',
      scope: 'global',
      confidence: 'high',
      evidence: pronounMatch[0],
    });
  }

  // COMMUNICATION patterns
  const shortResponsePatterns = [
    /(?:keep|make).+(?:short|brief|concise)/i,
    /(?:shorter|briefer)\s+responses?/i,
    /be\s+(?:more\s+)?(?:direct|concise|brief)/i,
    /(?:more|be)\s+casual/i,
  ];

  for (const pattern of shortResponsePatterns) {
    const match = message.match(pattern);
    if (match) {
      suggestions.push({
        suggestedContent: 'Keep responses brief and direct',
        category: 'COMMUNICATION',
        scope: 'global',
        confidence: 'medium',
        evidence: match[0],
      });
      break;
    }
  }

  // RELATIONSHIP patterns - require explicit name introduction
  const partnerNameMatch = message.match(
    /(?:my partner(?:'s name)?|my (?:husband|wife|spouse|boyfriend|girlfriend)(?:'s name)?)\s+(?:is\s+)?(?:named\s+)?["']?([A-Z][a-zA-Z]+)["']?/i
  );
  // Only match if we found a capitalized name (not just any word after "my partner")
  if (partnerNameMatch && partnerNameMatch[1]) {
    suggestions.push({
      suggestedContent: `The user's partner is named ${partnerNameMatch[1]}`,
      category: 'RELATIONSHIP',
      scope: 'session',
      confidence: 'high',
      evidence: partnerNameMatch[0],
    });
  }

  // PREFERENCE patterns
  const preferencePatterns = [
    { pattern: /don't use (?:analogies|metaphors)/i, content: 'Avoid using analogies or metaphors' },
    { pattern: /(?:give|use|include)\s+(?:more\s+)?examples?/i, content: 'Include examples when explaining' },
    { pattern: /(?:don't|no)\s+(?:bullet\s+)?(?:points|lists)/i, content: 'Avoid using bullet points or lists' },
  ];

  for (const { pattern, content } of preferencePatterns) {
    const match = message.match(pattern);
    if (match) {
      suggestions.push({
        suggestedContent: content,
        category: 'PREFERENCE',
        scope: 'global',
        confidence: 'medium',
        evidence: match[0],
      });
    }
  }

  return {
    hasMemoryIntent: suggestions.length > 0,
    suggestions,
    topicContext: '', // Mock doesn't infer topic context
  };
}
