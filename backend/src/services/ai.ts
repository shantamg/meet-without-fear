/**
 * AI Service
 *
 * Provides AI-powered responses for the Meet Without Fear process.
 * Uses the AI Orchestrator for the full pipeline:
 * - Memory Intent → Context Assembly → Retrieval Planning → Response Generation
 *
 * Two-model stratification:
 * - Haiku: Fast mechanics (retrieval planning, classification)
 * - Sonnet: Empathetic user-facing responses
 */

import { getCompletion, resetBedrockClient, getBedrockClient } from '../lib/bedrock';
import {
  orchestrateResponse,
  type OrchestratorContext,
  type OrchestratorResult,
} from './ai-orchestrator';

// ============================================================================
// Types
// ============================================================================

export interface WitnessContext {
  userName: string;
  sessionContext?: string;
  turnCount: number;
  emotionalIntensity?: number;
  priorThemes?: string[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Extended context for full orchestration
 */
export interface FullAIContext extends WitnessContext {
  sessionId: string;
  userId: string;
  partnerName?: string;
  stage: number;
  sessionDurationMinutes?: number;
  isFirstTurnInSession?: boolean;
  /** Whether we're in the invitation crafting phase (stage 0, before partner joins) */
  isInvitationPhase?: boolean;
  /** Whether user is refining their invitation after Stage 1/2 processing */
  isRefiningInvitation?: boolean;
  /** Whether this is the first turn after advancing to a new stage (stage transition intro) */
  isStageTransition?: boolean;
  /** The stage we just transitioned from (for context gathering) */
  previousStage?: number;
  /** Current invitation message (for refinement context) */
  currentInvitationMessage?: string | null;
  /** Current empathy draft (for refinement in Stage 2) */
  currentEmpathyDraft?: string | null;
  /** Whether the user is actively refining their empathy draft */
  isRefiningEmpathy?: boolean;
  /** Whether the user is in onboarding mode (compact not yet signed) */
  isOnboarding?: boolean;
}

// Re-export orchestrator types for convenience
export type { OrchestratorResult } from './ai-orchestrator';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Reset the client (useful for testing)
 */
export function resetAIClient(): void {
  resetBedrockClient();
}

// ============================================================================
// Orchestrated Response (Full Pipeline)
// ============================================================================

/**
 * Get an AI response using the full orchestration pipeline.
 * This is the recommended method for production use.
 *
 * Pipeline:
 * 1. Memory Intent → determines retrieval depth
 * 2. Context Assembly → builds stage-scoped context
 * 3. Retrieval Planning (Haiku) → plans data queries
 * 4. Response Generation (Sonnet) → empathetic response
 *
 * @param messages - The conversation history
 * @param context - Full context including session/user IDs
 * @returns The orchestrator result with response and metadata
 */
export async function getOrchestratedResponse(
  messages: ConversationMessage[],
  context: FullAIContext
): Promise<OrchestratorResult> {
  const lastMessage = messages[messages.length - 1];
  const userMessage = lastMessage?.content || '';

  const orchestratorContext: OrchestratorContext = {
    sessionId: context.sessionId,
    userId: context.userId,
    userName: context.userName,
    partnerName: context.partnerName,
    stage: context.stage,
    userMessage,
    conversationHistory: messages.slice(0, -1), // Exclude current message
    turnCount: context.turnCount,
    emotionalIntensity: context.emotionalIntensity ?? 5,
    sessionDurationMinutes: context.sessionDurationMinutes,
    isFirstTurnInSession: context.isFirstTurnInSession,
    isInvitationPhase: context.isInvitationPhase,
    isRefiningInvitation: context.isRefiningInvitation,
    isStageTransition: context.isStageTransition,
    previousStage: context.previousStage,
    currentInvitationMessage: context.currentInvitationMessage,
    currentEmpathyDraft: context.currentEmpathyDraft,
    isRefiningEmpathy: context.isRefiningEmpathy,
    isOnboarding: context.isOnboarding,
  };

  return orchestrateResponse(orchestratorContext);
}

// ============================================================================
// AI Service Health Check
// ============================================================================

/**
 * Check if the AI service is properly configured and accessible.
 */
export async function checkAIServiceHealth(): Promise<{
  configured: boolean;
  accessible: boolean;
  error?: string;
}> {
  const client = getBedrockClient();

  if (!client) {
    return {
      configured: false,
      accessible: false,
      error: 'AWS credentials not configured',
    };
  }

  try {
    // Make a minimal API call to verify connectivity
    const response = await getCompletion({
      systemPrompt: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 10,
    });

    return {
      configured: true,
      accessible: response !== null,
    };
  } catch (error) {
    return {
      configured: true,
      accessible: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
