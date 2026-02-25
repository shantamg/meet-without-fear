/**
 * Micro-Tag Parser
 *
 * Parses the semantic tag format used by the AI response:
 * - <thinking>...</thinking> - Hidden analysis with flags
 * - <draft>...</draft> - Optional draft content (invitation/empathy)
 * - <dispatch>...</dispatch> - Optional off-ramp signal
 * - Everything else is the user-facing response
 */

import { extractJsonFromResponse } from './json-extractor';

export interface ParsedMicroTagResponse {
  /** The user-facing response text (all tags stripped) */
  response: string;
  /** The raw thinking block content (for logging) */
  thinking: string;
  /** Optional draft content (for invitation/empathy statements) */
  draft: string | null;
  /** Optional dispatch tag for off-ramping */
  dispatchTag: string | null;
  /** Extracted from thinking: FeelHeardCheck:Y */
  offerFeelHeardCheck: boolean;
  /** Extracted from thinking: ReadyShare:Y */
  offerReadyToShare: boolean;
  /** Extracted from thinking: ProposedStrategy lines (Stage 4) */
  proposedStrategies: string[];
}

/**
 * Parse the micro-tag response format.
 * Extracts semantic blocks and flags from the raw AI response.
 */
export function parseMicroTagResponse(rawResponse: string): ParsedMicroTagResponse {
  // 1. Extract blocks using regex
  const thinkingMatch = rawResponse.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const draftMatch = rawResponse.match(/<draft>([\s\S]*?)<\/draft>/i);
  const dispatchMatch = rawResponse.match(/<dispatch>([\s\S]*?)<\/dispatch>/i);

  const thinking = thinkingMatch?.[1]?.trim() ?? '';
  const draft = draftMatch?.[1]?.trim() ?? null;
  const dispatchTag = dispatchMatch?.[1]?.trim() ?? null;

  // 2. Clean response text - remove all tags
  let responseText = rawResponse
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
    .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '')
    .trim();

  // 3. Extract flags from thinking string (no JSON needed!)
  const offerFeelHeardCheck = /FeelHeardCheck:\s*Y/i.test(thinking);
  const offerReadyToShare = /ReadyShare:\s*Y/i.test(thinking);

  // 4. Extract proposed strategies from thinking (Stage 4)
  const proposedStrategies: string[] = [];
  const strategyRegex = /ProposedStrategy:\s*(.+)/gi;
  let strategyMatch: RegExpExecArray | null;
  while ((strategyMatch = strategyRegex.exec(thinking)) !== null) {
    const strategy = strategyMatch[1].trim();
    if (strategy.length > 0) {
      proposedStrategies.push(strategy);
    }
  }

  // 4. Compatibility fallback: JSON output
  if (!thinking && !draft && responseText.startsWith('{')) {
    try {
      const parsed = extractJsonFromResponse(responseText) as Record<string, unknown>;
      const response = typeof parsed.response === 'string' ? parsed.response : responseText;
      const invitation = typeof parsed.invitationMessage === 'string' ? parsed.invitationMessage : null;
      const empathy = typeof parsed.proposedEmpathyStatement === 'string' ? parsed.proposedEmpathyStatement : null;
      responseText = response;
      return {
        response: responseText,
        thinking: '',
        draft: invitation || empathy,
        dispatchTag: null,
        offerFeelHeardCheck,
        offerReadyToShare,
        proposedStrategies,
      };
    } catch {
      // Fall through to raw responseText
    }
  }

  return {
    response: responseText,
    thinking,
    draft,
    dispatchTag,
    offerFeelHeardCheck,
    offerReadyToShare,
    proposedStrategies,
  };
}
