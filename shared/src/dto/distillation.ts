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

export type TakeawayType = 'INSIGHT' | 'ACTION_ITEM' | 'INTENTION';
export type TakeawayLinkType = 'AI_SEMANTIC' | 'USER_MANUAL';

export interface TakeawayDTO {
  id: string;
  content: string;
  theme: string | null;
  source: 'AI' | 'USER';
  type: TakeawayType;
  position: number;
  resolved: boolean;
  resolvedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ============================================================================
// Takeaway Links
// ============================================================================

export interface TakeawayLinkDTO {
  id: string;
  linkedTakeaway: {
    id: string;
    content: string;
    theme: string | null;
    type: TakeawayType;
    sessionDate: string; // ISO 8601
  };
  linkType: TakeawayLinkType;
  similarity: number | null;
  createdAt: string; // ISO 8601
}

// GET /knowledge-base/takeaways/:id/links
export interface GetTakeawayLinksResponse {
  links: TakeawayLinkDTO[];
}

// POST /knowledge-base/takeaways/:id/links
export interface CreateTakeawayLinkRequest {
  targetId: string;
}

export interface CreateTakeawayLinkResponse {
  link: TakeawayLinkDTO;
}

// DELETE /knowledge-base/takeaways/:id/links/:linkId
export interface DeleteTakeawayLinkResponse {
  success: true;
}

// GET /knowledge-base/takeaways/:id/thread
export interface TakeawayThreadDTO {
  /** The root takeaway */
  root: TakeawayDTO & { sessionDate: string };
  /** All connected takeaways in chronological order */
  thread: Array<TakeawayDTO & { sessionDate: string; linkType: TakeawayLinkType }>;
}

// PATCH /knowledge-base/takeaways/:id/resolve
export interface ResolveTakeawayResponse {
  takeaway: TakeawayDTO;
}

// GET /knowledge-base/actions
export interface ListActionsResponse {
  actions: Array<TakeawayDTO & { sessionDate: string; topicTag: string | null }>;
}

// ============================================================================
// Distill Session (POST /inner-work/:id/distill)
// ============================================================================

export interface DistillSessionResponse {
  takeaways: TakeawayDTO[];
  distilledAt: string; // ISO 8601
}

// ============================================================================
// Get Takeaways (GET /inner-thoughts/:id/takeaways)
// ============================================================================

export interface GetTakeawaysResponse {
  takeaways: TakeawayDTO[];
  distilledAt: string | null;
}

// ============================================================================
// Update Takeaway (PATCH /inner-thoughts/:id/takeaways/:takeawayId)
// ============================================================================

export interface UpdateTakeawayRequest {
  content: string;
}

export interface UpdateTakeawayResponse {
  takeaway: TakeawayDTO;
}

// ============================================================================
// Delete Takeaway (DELETE /inner-thoughts/:id/takeaways/:takeawayId)
// ============================================================================

export interface DeleteTakeawayResponse {
  success: true;
}
