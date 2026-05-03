/**
 * Needs Service
 *
 * Types and utilities for Stage 3 needs.
 * Extraction and common ground analysis have been removed as part of
 * the Stage 3 redesign (#247). Needs are now captured via the
 * conversational AI (summary cards) rather than a separate extraction step.
 */

import { resetBedrockClient } from '../lib/bedrock';
import { NeedCategory } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedNeed {
  category: NeedCategory;
  need: string;
  evidence: string[];
  aiConfidence: number;
}

export interface IdentifiedNeedRecord {
  id: string;
  vesselId: string;
  need: string;
  category: NeedCategory;
  evidence: string[];
  aiConfidence: number;
  confirmed: boolean;
  createdAt: Date;
}

/**
 * Reset the client (useful for testing)
 */
export function resetNeedsClient(): void {
  resetBedrockClient();
}
