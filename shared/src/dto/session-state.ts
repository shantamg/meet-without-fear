/**
 * Consolidated Session State DTO
 *
 * Single response containing core session data for efficient initial load.
 * Reduces multiple API calls to a single request.
 *
 * Stage-specific data (empathy drafts, needs, strategies, agreements) are
 * still fetched via individual endpoints to avoid duplicating complex logic.
 */

import { SessionStatus, StageStatus } from '../enums';
import { InvitationDTO } from './session';
import { CompactStatusResponse } from './stage';
import { MessageDTO } from './message';

// ============================================================================
// Consolidated Session State
// ============================================================================

/**
 * Core session data returned by GET /sessions/:id/state
 *
 * Combines essential data needed to render the session view in a single request.
 */
export interface SessionStateResponse {
  // Core session data
  session: {
    id: string;
    status: SessionStatus;
    currentStage: number;
    stageStatus: StageStatus;
    relationshipId: string;
    partner: {
      id: string;
      name: string | null;
      nickname: string | null;
    };
    myProgress: {
      stage: number;
      status: StageStatus;
    };
    createdAt: string;
    resolvedAt: string | null;
  };

  // Stage progress
  progress: {
    sessionId: string;
    myProgress: {
      stage: number;
      status: string;
      startedAt: string | null;
      completedAt: string | null;
      gatesSatisfied: unknown;
    };
    partnerProgress: {
      stage: number;
      status: string;
      startedAt: string | null;
      completedAt: string | null;
    };
    canAdvance: boolean;
    milestones: {
      feelHeardConfirmedAt: string | null;
    };
  };

  // Messages (initial page)
  messages: {
    messages: MessageDTO[];
    hasMore: boolean;
    cursor?: string;
  };

  // Stage 0: Onboarding
  invitation: {
    id: string;
    sessionId: string;
    invitedBy: { id: string; name: string | null };
    status: string;
    createdAt: string;
    expiresAt: string;
    invitationMessage?: string | null;
    messageConfirmed?: boolean;
    messageConfirmedAt?: string | null;
    acceptedAt?: string | null;
    isInviter: boolean;
  } | null;
  compact: CompactStatusResponse;
}
