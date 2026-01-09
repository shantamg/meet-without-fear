/**
 * Reconciler DTOs
 *
 * Data Transfer Objects for the Empathy Reconciler system.
 * The reconciler analyzes gaps between what one person guessed about
 * the other's feelings vs. what they actually expressed.
 */

import { z } from 'zod';

// ============================================================================
// Enums and Constants
// ============================================================================

export const GapSeverity = {
  NONE: 'none',
  MINOR: 'minor',
  MODERATE: 'moderate',
  SIGNIFICANT: 'significant',
} as const;

export type GapSeverity = (typeof GapSeverity)[keyof typeof GapSeverity];

export const ReconcilerAction = {
  /** No gaps - proceed to next stage */
  PROCEED: 'PROCEED',
  /** Minor gaps - optionally offer to share more */
  OFFER_OPTIONAL: 'OFFER_OPTIONAL',
  /** Significant gaps - recommend sharing specific information */
  OFFER_SHARING: 'OFFER_SHARING',
} as const;

export type ReconcilerAction = (typeof ReconcilerAction)[keyof typeof ReconcilerAction];

export const ShareOfferStatus = {
  /** Not yet offered */
  NOT_OFFERED: 'NOT_OFFERED',
  /** Offer shown to user */
  OFFERED: 'OFFERED',
  /** User accepted and shared */
  ACCEPTED: 'ACCEPTED',
  /** User declined to share */
  DECLINED: 'DECLINED',
  /** User skipped without responding */
  SKIPPED: 'SKIPPED',
} as const;

export type ShareOfferStatus = (typeof ShareOfferStatus)[keyof typeof ShareOfferStatus];

// ============================================================================
// Reconciler Result Types
// ============================================================================

/**
 * Alignment analysis - what the guesser got right
 */
export const alignmentSchema = z.object({
  /** 0-100 score of how well they understood */
  score: z.number().min(0).max(100),
  /** Human-readable summary */
  summary: z.string(),
  /** List of correctly identified feelings/needs */
  correctlyIdentified: z.array(z.string()),
});

export type Alignment = z.infer<typeof alignmentSchema>;

/**
 * Gap analysis - what was missed or misunderstood
 */
export const gapsSchema = z.object({
  /** Severity of the gap */
  severity: z.enum(['none', 'minor', 'moderate', 'significant']),
  /** Human-readable summary of what was missed */
  summary: z.string(),
  /** List of feelings/needs that were missed */
  missedFeelings: z.array(z.string()),
  /** List of incorrect assumptions made */
  misattributions: z.array(z.string()),
  /** The single most important thing that was missed */
  mostImportantGap: z.string().nullable(),
});

export type Gaps = z.infer<typeof gapsSchema>;

/**
 * Recommendation from the reconciler
 */
export const recommendationSchema = z.object({
  /** What action to take */
  action: z.enum(['PROCEED', 'OFFER_OPTIONAL', 'OFFER_SHARING']),
  /** Why this recommendation was made */
  rationale: z.string(),
  /** Whether sharing would help bridge the gap */
  sharingWouldHelp: z.boolean(),
  /** What specific aspect the subject should consider sharing */
  suggestedShareFocus: z.string().nullable(),
});

export type Recommendation = z.infer<typeof recommendationSchema>;

/**
 * Abstract guidance for refinement (no specific partner content)
 */
export const abstractGuidanceSchema = z.object({
  /** Abstract area hint, e.g., "work and effort" */
  areaHint: z.string().nullable(),
  /** Type of guidance, e.g., "explore_deeper_feelings" */
  guidanceType: z.string().nullable(),
  /** Seed for prompt generation, e.g., "what might be underneath" */
  promptSeed: z.string().nullable(),
});

export type AbstractGuidance = z.infer<typeof abstractGuidanceSchema>;

/**
 * Full reconciler analysis result
 */
export const reconcilerResultSchema = z.object({
  alignment: alignmentSchema,
  gaps: gapsSchema,
  recommendation: recommendationSchema,
  /** Abstract guidance for refinement (does not expose partner's specific content) */
  abstractGuidance: abstractGuidanceSchema.optional(),
});

export type ReconcilerResult = z.infer<typeof reconcilerResultSchema>;

// ============================================================================
// Quote Selection Types
// ============================================================================

/**
 * A shareable quote option extracted from witnessing
 */
export const quoteOptionSchema = z.object({
  /** The quote or paraphrase content */
  content: z.string(),
  /** How this addresses the gap */
  addressesGap: z.string(),
  /** Emotional intensity level */
  intensity: z.enum(['low', 'medium', 'high']),
  /** Whether additional context is needed */
  requiresContext: z.boolean(),
});

export type QuoteOption = z.infer<typeof quoteOptionSchema>;

/**
 * Quote selection result from the AI
 */
export const quoteSelectionResultSchema = z.object({
  /** Available quote options */
  options: z.array(quoteOptionSchema),
  /** Which option is recommended and why */
  recommendation: z.string(),
  /** Whether there are no good options to share */
  noGoodOptions: z.boolean(),
  /** If noGoodOptions, why */
  noGoodOptionsReason: z.string().nullable(),
});

export type QuoteSelectionResult = z.infer<typeof quoteSelectionResultSchema>;

// ============================================================================
// Share Offer Types
// ============================================================================

/**
 * Share offer message from the AI
 */
export const shareOfferMessageSchema = z.object({
  /** The invitation message to the user */
  message: z.string(),
  /** Whether a quote can be extracted */
  canQuote: z.boolean(),
  /** Suggested quote to share */
  suggestedQuote: z.string().nullable(),
});

export type ShareOfferMessage = z.infer<typeof shareOfferMessageSchema>;

// ============================================================================
// API Request/Response Schemas
// ============================================================================

/**
 * Request to run reconciler for a session
 */
export const runReconcilerRequestSchema = z.object({
  /** Run reconciler for specific user only (optional - runs for both if not specified) */
  forUserId: z.string().optional(),
});

export type RunReconcilerRequest = z.infer<typeof runReconcilerRequestSchema>;

/**
 * Single user's reconciler result
 */
export const userReconcilerResultSchema = z.object({
  /** The user who made the empathy guess */
  guesserId: z.string(),
  guesserName: z.string(),
  /** The user being guessed about */
  subjectId: z.string(),
  subjectName: z.string(),
  /** The analysis result */
  result: reconcilerResultSchema,
  /** Current status of share offer */
  shareOfferStatus: z.enum(['NOT_OFFERED', 'OFFERED', 'ACCEPTED', 'DECLINED', 'SKIPPED']),
  /** When this was analyzed */
  analyzedAt: z.string(),
});

export type UserReconcilerResult = z.infer<typeof userReconcilerResultSchema>;

/**
 * Response from running reconciler
 */
export const runReconcilerResponseSchema = z.object({
  sessionId: z.string(),
  /** Analysis of how User A understood User B */
  aUnderstandingB: userReconcilerResultSchema.nullable(),
  /** Analysis of how User B understood User A */
  bUnderstandingA: userReconcilerResultSchema.nullable(),
  /** Whether both users have completed Stage 2 */
  bothCompleted: z.boolean(),
  /** Overall readiness to proceed */
  readyToProceed: z.boolean(),
  /** If not ready, why */
  blockingReason: z.string().nullable(),
});

export type RunReconcilerResponse = z.infer<typeof runReconcilerResponseSchema>;

/**
 * Request to respond to a share offer
 */
export const respondToShareOfferRequestSchema = z.object({
  /** Whether they accept to share */
  accept: z.boolean(),
  /** If accepting, selected quote option index or custom content */
  selectedQuoteIndex: z.number().optional(),
  customContent: z.string().optional(),
});

export type RespondToShareOfferRequest = z.infer<typeof respondToShareOfferRequestSchema>;

/**
 * Response after responding to share offer
 */
export const respondToShareOfferResponseSchema = z.object({
  /** Status after response */
  status: z.enum(['ACCEPTED', 'DECLINED']),
  /** If accepted, what was shared */
  sharedContent: z.string().nullable(),
  /** Message confirming the action */
  confirmationMessage: z.string(),
});

export type RespondToShareOfferResponse = z.infer<typeof respondToShareOfferResponseSchema>;

/**
 * Request to get quote options for sharing
 */
export const getQuoteOptionsRequestSchema = z.object({
  /** Optional: specific gap to focus on */
  focusGap: z.string().optional(),
});

export type GetQuoteOptionsRequest = z.infer<typeof getQuoteOptionsRequestSchema>;

/**
 * Response with quote options
 */
export const getQuoteOptionsResponseSchema = z.object({
  /** The gap being addressed */
  gapDescription: z.string(),
  /** Available quotes to share */
  quoteOptions: z.array(quoteOptionSchema),
  /** Recommended option index */
  recommendedIndex: z.number().nullable(),
  /** Whether there are good options */
  hasGoodOptions: z.boolean(),
});

export type GetQuoteOptionsResponse = z.infer<typeof getQuoteOptionsResponseSchema>;

/**
 * Reconciler status for a session
 */
export const reconcilerStatusResponseSchema = z.object({
  sessionId: z.string(),
  /** Whether reconciler has run */
  hasRun: z.boolean(),
  /** Results for each direction */
  aUnderstandingB: userReconcilerResultSchema.nullable(),
  bUnderstandingA: userReconcilerResultSchema.nullable(),
  /** Whether any sharing offers are pending */
  pendingShareOffers: z.number(),
  /** Whether ready to proceed to Stage 3 */
  readyForStage3: z.boolean(),
});

export type ReconcilerStatusResponse = z.infer<typeof reconcilerStatusResponseSchema>;

/**
 * Summary after reconciliation is complete
 */
export const reconcilerSummarySchema = z.object({
  /** AI-generated summary of the empathy exchange */
  summary: z.string(),
  /** Whether ready for next stage */
  readyForNextStage: z.boolean(),
});

export type ReconcilerSummary = z.infer<typeof reconcilerSummarySchema>;
