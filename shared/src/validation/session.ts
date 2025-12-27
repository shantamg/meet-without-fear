/**
 * Session Validation Schemas
 *
 * Zod schemas for validating session-related API requests.
 * Note: More complete schemas are in contracts/sessions.ts.
 * This file provides standalone validation utilities.
 */

import { z } from 'zod';
import { SessionStatus, Stage, StageStatus } from '../enums';
import {
  createSessionRequestSchema,
  createSessionResponseSchema,
  listSessionsQuerySchema,
  listSessionsResponseSchema,
  getSessionResponseSchema,
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  declineInvitationRequestSchema,
  declineInvitationResponseSchema,
} from '../contracts/sessions';

// ============================================================================
// Session Status & Stage Enums as Zod
// ============================================================================

export const sessionStatusSchema = z.nativeEnum(SessionStatus);
export const stageSchema = z.nativeEnum(Stage);
export const stageStatusSchema = z.nativeEnum(StageStatus);

// ============================================================================
// Stage Progress Validation
// ============================================================================

export const stageProgressSchema = z.object({
  stage: stageSchema,
  status: stageStatusSchema,
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export type StageProgressInput = z.infer<typeof stageProgressSchema>;

// ============================================================================
// Request/Response Validation (re-exported from contracts for runtime use)
// ============================================================================

export {
  createSessionRequestSchema as validateCreateSessionRequest,
  createSessionResponseSchema as validateCreateSessionResponse,
  listSessionsQuerySchema as validateListSessionsQuery,
  listSessionsResponseSchema as validateListSessionsResponse,
  getSessionResponseSchema as validateGetSessionResponse,
  acceptInvitationRequestSchema as validateAcceptInvitationRequest,
  acceptInvitationResponseSchema as validateAcceptInvitationResponse,
  declineInvitationRequestSchema as validateDeclineInvitationRequest,
  declineInvitationResponseSchema as validateDeclineInvitationResponse,
};

export type ValidateCreateSessionRequestInput = z.infer<typeof createSessionRequestSchema>;
export type ValidateCreateSessionResponseInput = z.infer<typeof createSessionResponseSchema>;
export type ValidateListSessionsQueryInput = z.infer<typeof listSessionsQuerySchema>;
export type ValidateListSessionsResponseInput = z.infer<typeof listSessionsResponseSchema>;
export type ValidateGetSessionResponseInput = z.infer<typeof getSessionResponseSchema>;
export type ValidateAcceptInvitationRequestInput = z.infer<typeof acceptInvitationRequestSchema>;
export type ValidateAcceptInvitationResponseInput = z.infer<typeof acceptInvitationResponseSchema>;
export type ValidateDeclineInvitationRequestInput = z.infer<typeof declineInvitationRequestSchema>;
export type ValidateDeclineInvitationResponseInput = z.infer<typeof declineInvitationResponseSchema>;
