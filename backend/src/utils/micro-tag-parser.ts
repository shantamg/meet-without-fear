/**
 * Micro-Tag Parser
 *
 * Parses the semantic tag format used by the AI response:
 * - <thinking>...</thinking> - Hidden analysis with flags
 * - <draft>...</draft> - Optional draft content (invitation/empathy)
 * - <needs>...</needs> - Optional structured Stage 3 needs JSON
 * - <dispatch>...</dispatch> - Optional off-ramp signal
 * - Everything else is the user-facing response
 */

import { extractJsonFromResponse } from './json-extractor';
import { logger } from '../lib/logger';
import { NeedCategory, type CapturedNeedInput } from '@meet-without-fear/shared';
import { cleanVisibleAIText } from './visible-text';

export interface ParsedMicroTagResponse {
  /** The user-facing response text (all tags stripped) */
  response: string;
  /** The raw thinking block content (for logging) */
  thinking: string;
  /** Optional draft content (for empathy or topic frame).
   *  Stage 0 uses this as the topic frame; Stage 2 uses it as the empathy draft. */
  draft: string | null;
  /** Convenience alias of `draft` for Stage 0 callers. Mirrors `draft`. */
  topicFrame: string | null;
  /** Optional dispatch tag for off-ramping */
  dispatchTag: string | null;
  /** Extracted from thinking: FeelHeardCheck:Y */
  offerFeelHeardCheck: boolean;
  /** Extracted from thinking: ReadyShare:Y */
  offerReadyToShare: boolean;
  /** Extracted from thinking: ProposedStrategy lines (Stage 4) */
  proposedStrategies: string[];
  /** Structured needs proposed by Stage 3 in a hidden <needs> JSON block */
  proposedNeeds: CapturedNeedInput[];
}

function isNeedCategory(value: unknown): value is NeedCategory {
  return typeof value === 'string' && Object.values(NeedCategory).includes(value as NeedCategory);
}

function parseNeedsBlock(rawNeeds: string | null): CapturedNeedInput[] {
  if (!rawNeeds) return [];

  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawNeeds);
    } catch {
      parsed = extractJsonFromResponse(rawNeeds) as unknown;
    }
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { needs?: unknown }).needs)
        ? (parsed as { needs: unknown[] }).needs
        : [];

    return items.flatMap((item): CapturedNeedInput[] => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as Record<string, unknown>;
      const need = typeof candidate.need === 'string' ? cleanVisibleAIText(candidate.need) : '';
      const description = typeof candidate.description === 'string'
        ? cleanVisibleAIText(candidate.description)
        : need;
      const category = candidate.category;
      const evidence = Array.isArray(candidate.evidence)
        ? candidate.evidence
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .map(cleanVisibleAIText)
            .filter(Boolean)
        : [];

      if (!need || !description || !isNeedCategory(category)) return [];

      return [{
        need,
        category,
        description,
        evidence,
      }];
    });
  } catch (error) {
    logger.warn('[micro-tag-parser] Failed to parse <needs> block', error);
    return [];
  }
}

/**
 * Parse the micro-tag response format.
 * Extracts semantic blocks and flags from the raw AI response.
 */
export function parseMicroTagResponse(rawResponse: string): ParsedMicroTagResponse {
  // 1. Extract blocks using regex
  const thinkingMatch = rawResponse.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const draftMatch = rawResponse.match(/<draft>([\s\S]*?)<\/draft>/i);
  const needsMatch = rawResponse.match(/<needs>([\s\S]*?)<\/needs>/i);
  const dispatchMatch = rawResponse.match(/<dispatch>([\s\S]*?)<\/dispatch>/i);

  const thinking = thinkingMatch?.[1]?.trim() ?? '';
  const draft = draftMatch?.[1]?.trim() ?? null;
  const needsRaw = needsMatch?.[1]?.trim() ?? null;
  const dispatchTag = dispatchMatch?.[1]?.trim() ?? null;
  const proposedNeeds = parseNeedsBlock(needsRaw);

  // 2. Clean response text - remove all tags
  let responseText = rawResponse
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
    .replace(/<needs>[\s\S]*?<\/needs>/gi, '')
    .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '')
    .trim();

  // If everything landed inside tags, leave response empty and let the caller
  // decide what to do. A dispatch handler may still fill it in; otherwise the
  // streaming endpoint should send an SSE error and ask the user to retry,
  // rather than persisting a confusing "AI processing…" placeholder message.
  if (!responseText && (thinking || draft || dispatchTag)) {
    logger.warn('[micro-tag-parser] Empty response after tag stripping', {
      hasThinking: !!thinking,
      hasDraft: !!draft,
      dispatchTag: dispatchTag ?? null,
    });
  }

  // 3. Extract flags from thinking string (no JSON needed!)
  const offerFeelHeardCheck = /FeelHeardCheck:\s*Y/i.test(thinking);
  const offerReadyToShare = /ReadyShare:\s*Y/i.test(thinking);

  // 4. Extract proposed strategies from thinking (Stage 4)
  const proposedStrategies: string[] = [];
  const strategyRegex = /ProposedStrategy:\s*(.+)/gi;
  let strategyMatch: RegExpExecArray | null;
  while ((strategyMatch = strategyRegex.exec(thinking)) !== null) {
    const strategy = cleanVisibleAIText(strategyMatch[1]);
    if (strategy.length > 0) {
      proposedStrategies.push(strategy);
    }
  }

  const needRegex = /ProposedNeed:\s*([^|]+)\|([^|]+)\|(.+)/gi;
  let needMatch: RegExpExecArray | null;
  while ((needMatch = needRegex.exec(thinking)) !== null) {
    const need = cleanVisibleAIText(needMatch[1]);
    const category = needMatch[2].trim();
    const description = cleanVisibleAIText(needMatch[3]);
    if (need && isNeedCategory(category) && description) {
      proposedNeeds.push({ need, category, description, evidence: [] });
    }
  }

  // 4. Compatibility fallback: JSON output (legacy stages may emit empathy as JSON)
  if (!thinking && !draft && responseText.startsWith('{')) {
    try {
      const parsed = extractJsonFromResponse(responseText) as Record<string, unknown>;
      const response = typeof parsed.response === 'string' ? parsed.response : responseText;
      const empathy = typeof parsed.proposedEmpathyStatement === 'string' ? parsed.proposedEmpathyStatement : null;
      responseText = response;
      return {
        response: responseText,
        thinking: '',
        draft: empathy,
        topicFrame: empathy,
        dispatchTag: null,
        offerFeelHeardCheck,
        offerReadyToShare,
        proposedStrategies,
        proposedNeeds,
      };
    } catch {
      // Fall through to raw responseText
    }
  }

  return {
    response: responseText,
    thinking,
    draft,
    topicFrame: draft,
    dispatchTag,
    offerFeelHeardCheck,
    offerReadyToShare,
    proposedStrategies,
    proposedNeeds,
  };
}
