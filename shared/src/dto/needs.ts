/**
 * Need Mapping DTOs (Stage 3)
 *
 * Data Transfer Objects for need identification, capture, and validation.
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
  synthesizedAt: string | null;
  extracting?: boolean; // True if AI extraction is currently in progress
  isDirty?: boolean; // True if content changed since synthesis
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
}

// ============================================================================
// Capture Needs (from AI summary card)
// ============================================================================

export interface CapturedNeedInput {
  need: string;
  category: NeedCategory;
  description: string;
  evidence: string[];
}

export interface CaptureNeedsRequest {
  needs: CapturedNeedInput[];
}

export interface CaptureNeedsResponse {
  needs: IdentifiedNeedDTO[];
  capturedAt: string;
}

// ============================================================================
// Validate Needs (user affirms both lists as valid)
// ============================================================================

export interface ValidateNeedsResponse {
  validated: boolean;
  validatedAt: string;
  partnerValidated: boolean;
  canAdvance: boolean;
}

// ============================================================================
// Needs Comparison (Side-by-Side Reveal)
// ============================================================================

export interface NeedsComparisonNeedDTO {
  id: string;
  category: NeedCategory;
  need: string;
  confirmed: boolean;
}

export interface GetNeedsComparisonResponse {
  myNeeds: NeedsComparisonNeedDTO[];
  partnerNeeds: NeedsComparisonNeedDTO[];
}
