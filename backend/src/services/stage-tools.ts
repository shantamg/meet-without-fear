/**
 * Stage Tools
 *
 * Defines Claude Tool Use definitions for stage-specific metadata delivery.
 * These tools replace the JSON wrapper format for structured AI responses.
 */

import type { Tool } from '@aws-sdk/client-bedrock-runtime';

/**
 * Session state tool for delivering stage metadata via Tool Use.
 *
 * Claude calls this tool at the end of each response to provide:
 * - Stage 0: invitationMessage
 * - Stage 1: offerFeelHeardCheck
 * - Stage 2: offerReadyToShare, proposedEmpathyStatement
 * - All stages: analysis (optional, for status dashboard)
 *
 * The tool is designed so Claude only provides fields relevant to the current stage.
 */
export const SESSION_STATE_TOOL: Tool = {
  toolSpec: {
    name: 'update_session_state',
    description: `Report session state after your response. Only include fields relevant to the current stage:
- Stage 0 (Invitation): Set invitationMessage when you have a draft ready
- Stage 1 (Witnessing): Set offerFeelHeardCheck=true when the user seems fully heard
- Stage 2 (Empathy Building): Set offerReadyToShare=true and proposedEmpathyStatement when ready

IMPORTANT: Always call this tool after your text response, even if all fields are empty/false.
NOTE: All reasoning goes in the <analysis> block before your text, NOT in this tool.`,
    inputSchema: {
      json: {
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
          invitationMessage: {
            type: 'string',
            description:
              'Stage 0 only: The invitation message draft for the partner.',
          },
        },
        additionalProperties: false,
      },
    },
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
  invitationMessage?: string;
}

/**
 * Validate and normalize session state tool input.
 * Ensures type safety and default values.
 */
export function parseSessionStateToolInput(
  input: Record<string, unknown>
): SessionStateToolInput {
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
    invitationMessage: typeof input.invitationMessage === 'string'
      ? input.invitationMessage
      : undefined,
  };
}

/**
 * Get the tools array for a specific stage.
 * Currently returns SESSION_STATE_TOOL for all stages.
 */
export function getToolsForStage(_stage: number): Tool[] {
  return [SESSION_STATE_TOOL];
}
