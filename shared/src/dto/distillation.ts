/**
 * Distillation DTOs
 *
 * Data Transfer Objects for the session distillation feature.
 * Distillation extracts key takeaways from an inner work session into a
 * structured list that the user can review and optionally save to their
 * knowledge base.
 */

// ============================================================================
// Takeaway
// ============================================================================

export interface TakeawayDTO {
  id: string;
  content: string;
  theme: string | null;
  source: 'AI' | 'USER';
  position: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ============================================================================
// Distill Session (POST /inner-work/:id/distill)
// ============================================================================

export interface DistillSessionResponse {
  takeaways: TakeawayDTO[];
  distilledAt: string; // ISO 8601
}

// ============================================================================
// Get Takeaways (GET /inner-work/:id/takeaways)
// ============================================================================

export interface GetTakeawaysResponse {
  takeaways: TakeawayDTO[];
  distilledAt: string | null;
}
