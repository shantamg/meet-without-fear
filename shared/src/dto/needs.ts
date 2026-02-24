/**
 * Need Mapping DTOs (Stage 3)
 *
 * Data Transfer Objects for need synthesis and common ground discovery.
 */

import { NeedCategory } from '../enums';

// ============================================================================
// Identified Needs
// ============================================================================

export interface IdentifiedNeedDTO {
  id: string;
  need: string; // e.g., "Recognition"
  category: NeedCategory;
  description: string; // Specific description for this user
  evidence: string[]; // Quotes/references supporting this
  confirmed: boolean;
  aiConfidence: number; // 0-1
}

export interface GetNeedsResponse {
  needs: IdentifiedNeedDTO[];
  synthesizedAt: string;
  isDirty: boolean; // True if content changed since synthesis
}

// ============================================================================
// Need Confirmation
// ============================================================================

export interface NeedAdjustment {
  needId: string;
  confirmed: boolean;
  correction?: string; // If user wants to rephrase
}

/**
 * @deprecated Use ConfirmNeedsRequestInput from contracts/stages for Zod-validated type.
 * Kept for backward compatibility - aligns with the Zod schema (needIds + adjustments).
 */
export interface ConfirmNeedsRequest {
  needIds: string[];
  adjustments?: NeedAdjustment[];
}

export interface ConfirmNeedsResponse {
  confirmed: boolean;
  confirmedAt: string;
  partnerConfirmed: boolean;
  canAdvance: boolean;
}

// ============================================================================
// Add Custom Need
// ============================================================================

export interface AddNeedRequest {
  need: string;
  category: NeedCategory;
  description: string;
}

export interface AddNeedResponse {
  need: IdentifiedNeedDTO;
}

// ============================================================================
// Consent to Share Needs
// ============================================================================

export interface ConsentShareNeedsRequest {
  needIds: string[];
}

export interface ConsentShareNeedsResponse {
  consented: boolean;
  sharedAt: string;
  waitingForPartner: boolean;
  commonGroundReady: boolean;
}

// ============================================================================
// Common Ground
// ============================================================================

export interface CommonGroundDTO {
  id: string;
  need: string;
  category: NeedCategory;
  description: string;
  confirmedByMe: boolean;
  confirmedByPartner: boolean;
  confirmedAt: string | null;
}

export interface GetCommonGroundResponse {
  commonGround: CommonGroundDTO[];
  analysisComplete: boolean;
  bothConfirmed: boolean;
}

export interface ConfirmCommonGroundRequest {
  confirmations: {
    commonGroundId: string;
    confirmed: boolean;
  }[];
}

export interface ConfirmCommonGroundResponse {
  updated: CommonGroundDTO[];
  allConfirmedByMe: boolean;
  allConfirmedByBoth: boolean;
  canAdvance: boolean;
}
