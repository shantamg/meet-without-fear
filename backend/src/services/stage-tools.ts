/**
 * Stage Tools
 *
 * Defines Claude Tool Use definitions for stage-specific metadata delivery.
 * These tools replace the JSON wrapper format for structured AI responses.
 */

import type { CapturedNeedInput, ParsedNeedAction } from '@meet-without-fear/shared';
import { Stage4ProposalKind } from '@meet-without-fear/shared';
import type { AnthropicToolDef } from '../lib/bedrock';
import type {
  ParsedStage4ProposalAction,
  ParsedStage4ProposalClassification,
  ParsedStage4ProposalInput,
  ParsedStage4WalkthroughAction,
  ParsedStage4WalkthroughActionType,
} from '../utils/micro-tag-parser';

/**
 * Session state tool for delivering stage metadata via Tool Use.
 *
 * Claude calls this tool at the end of each response to provide:
 * - Stage 1: offerFeelHeardCheck
 * - Stage 2: offerReadyToShare, proposedEmpathyStatement
 * - All stages: analysis (optional, for status dashboard)
 *
 * The tool is designed so Claude only provides fields relevant to the current stage.
 */
export const SESSION_STATE_TOOL: AnthropicToolDef = {
  name: 'update_session_state',
  description: `Report structured session state for the current turn. Only include fields relevant to the current stage:
- Stage 1 (Witnessing): Set offerFeelHeardCheck=true when the user seems fully heard
- Stage 2 (Empathy Building): Set offerReadyToShare=true and proposedEmpathyStatement when ready
- Stage 4 (Repair): Use stage4Proposals for proposal inventory changes and stage4WalkthroughAction for current-need progress.

For Stage 4, call this tool before your visible conversational response when the latest turn requires proposal capture or walkthrough progress. Do not put tool JSON, internal reasoning, XML tags, or state summaries in visible text.`,
  input_schema: {
    type: 'object',
    properties: {
      offerFeelHeardCheck: {
        type: 'boolean',
        description:
          'Stage 1 only: Set to true when the user appears fully heard and ready for the feel-heard checkpoint.',
      },
      offerReadyToShare: {
        type: 'boolean',
        description:
          'Stage 2 only: Set to true when the empathy statement is ready to share with their partner.',
      },
      proposedEmpathyStatement: {
        type: 'string',
        description:
          'Stage 2 only: The empathy statement draft in first person from the partner\'s perspective.',
      },
      stage4Proposals: {
        type: 'array',
        description: 'Stage 4 only: structured proposal inventory actions for the latest user turn.',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['ADD', 'REVISE', 'REMOVE', 'IGNORE'] },
            targetProposalId: { type: ['string', 'null'] },
            classification: { type: 'string', enum: ['PROPOSAL', 'REFLECTION', 'SUCCESS_MARKER', 'PROCESS'] },
            description: { type: 'string' },
            kind: { type: ['string', 'null'], enum: ['SHARED_PROPOSAL', 'INDIVIDUAL_COMMITMENT', null] },
            ownerUserId: { type: ['string', 'null'] },
            needsAddressed: { type: 'array', items: { type: 'string' } },
            duration: { type: ['string', 'null'] },
            measureOfSuccess: { type: ['string', 'null'] },
          },
          required: ['action', 'classification', 'description'],
          additionalProperties: false,
        },
      },
      stage4WalkthroughAction: {
        type: 'object',
        description: 'Stage 4 only: current-need walkthrough decision for the latest turn.',
        properties: {
          action: { type: 'string', enum: ['COVERED', 'SKIP', 'NONE'] },
          needId: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
};

/**
 * Tool name constant for matching tool calls
 */
export const SESSION_STATE_TOOL_NAME = 'update_session_state';

/**
 * Type for the parsed tool input from SESSION_STATE_TOOL
 */
export interface SessionStateToolInput {
  offerFeelHeardCheck?: boolean;
  offerReadyToShare?: boolean;
  proposedEmpathyStatement?: string;
  proposedStrategies?: string[];
  stage4Proposals?: ParsedStage4ProposalInput[];
  stage4WalkthroughAction?: ParsedStage4WalkthroughAction;
  proposedNeeds?: CapturedNeedInput[];
  proposedNeed?: CapturedNeedInput;
  needAction?: ParsedNeedAction;
  needParseError?: string;
  needsCaptured?: boolean;
  stage4Capture?: {
    appliedOperationCount: number;
    skippedOperationCount: number;
    selectionCaptured: boolean;
    closureSignalCaptured?: boolean;
    autoClosed?: boolean;
    confidence: number;
  };
  /** Stage 0: AI's proposed topic frame extracted from <draft> tag */
  topicFrame?: string;
}

/**
 * Validate and normalize session state tool input.
 * Ensures type safety and default values.
 */
export function parseSessionStateToolInput(
  input: Record<string, unknown>
): SessionStateToolInput {
  const stage4Proposals = parseStage4Proposals(input.stage4Proposals);
  const stage4WalkthroughAction = parseStage4WalkthroughAction(input.stage4WalkthroughAction);

  return {
    offerFeelHeardCheck: typeof input.offerFeelHeardCheck === 'boolean'
      ? input.offerFeelHeardCheck
      : false,
    offerReadyToShare: typeof input.offerReadyToShare === 'boolean'
      ? input.offerReadyToShare
      : false,
    proposedEmpathyStatement: typeof input.proposedEmpathyStatement === 'string'
      ? input.proposedEmpathyStatement
      : undefined,
    ...(stage4Proposals.length > 0 ? { stage4Proposals } : {}),
    ...(stage4WalkthroughAction ? { stage4WalkthroughAction } : {}),
  };
}

function isStage4ProposalAction(value: unknown): value is ParsedStage4ProposalAction {
  return value === 'ADD' || value === 'REVISE' || value === 'REMOVE' || value === 'IGNORE';
}

function isStage4ProposalClassification(value: unknown): value is ParsedStage4ProposalClassification {
  return value === 'PROPOSAL' || value === 'REFLECTION' || value === 'SUCCESS_MARKER' || value === 'PROCESS';
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseStage4Proposals(value: unknown): ParsedStage4ProposalInput[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): ParsedStage4ProposalInput[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    if (!isStage4ProposalAction(candidate.action)) return [];
    if (!isStage4ProposalClassification(candidate.classification)) return [];
    const description = parseOptionalString(candidate.description);
    if (!description) return [];
    const kind = typeof candidate.kind === 'string' &&
      Object.values(Stage4ProposalKind).includes(candidate.kind as Stage4ProposalKind)
      ? candidate.kind as Stage4ProposalKind
      : undefined;
    const needsAddressed = Array.isArray(candidate.needsAddressed)
      ? candidate.needsAddressed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
      : undefined;

    return [{
      action: candidate.action,
      targetProposalId: parseOptionalString(candidate.targetProposalId),
      classification: candidate.classification,
      description,
      kind,
      ownerUserId: parseOptionalString(candidate.ownerUserId),
      needsAddressed,
      duration: parseOptionalString(candidate.duration),
      measureOfSuccess: parseOptionalString(candidate.measureOfSuccess),
    }];
  });
}

function isStage4WalkthroughActionType(value: unknown): value is ParsedStage4WalkthroughActionType {
  return value === 'COVERED' || value === 'SKIP' || value === 'NONE';
}

function parseStage4WalkthroughAction(value: unknown): ParsedStage4WalkthroughAction | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (!isStage4WalkthroughActionType(candidate.action)) return undefined;
  return {
    action: candidate.action,
    needId: parseOptionalString(candidate.needId),
    reason: parseOptionalString(candidate.reason),
  };
}

/**
 * Get the tools array for a specific stage.
 * Currently returns SESSION_STATE_TOOL for all stages.
 */
export function getToolsForStage(_stage: number): AnthropicToolDef[] {
  return [SESSION_STATE_TOOL];
}
