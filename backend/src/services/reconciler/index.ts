/**
 * Empathy Reconciler Service
 *
 * Analyzes the gap between what one person guessed about the other's feelings
 * vs what they actually expressed. This runs ASYMMETRICALLY - when User A
 * submits their empathy statement about User B, the reconciler runs as soon as
 * User B completes Stage 1 (not waiting for User B to submit empathy).
 *
 * Flow:
 * 1. User A completes Stage 2 (shares empathy statement about User B) -> status = HELD
 * 2. User B completes Stage 1 (confirms "I feel heard") -> triggers reconciler for A->B direction
 * 3. Reconciler compares A's empathy guess vs B's actual witnessing content
 * 4. If gaps exist:
 *    a. Generate a suggestion for B to share with A (status = AWAITING_SHARING)
 *    b. B can accept, refine, or decline
 *    c. If B shares, A receives the context and can refine their empathy (status = REFINING)
 * 5. Once A's empathy is approved (or B declines to share), A's empathy is REVEALED to B
 *
 * Module structure:
 * - circuit-breaker.ts: Attempt tracking and skip logic
 * - analysis.ts: Gap analysis, AI prompt building (runReconciler)
 * - sharing.ts: Share suggestion generation/refinement
 * - state.ts: Empathy status transitions, reveal logic
 */

// Circuit Breaker
export {
  checkAttempts,
  incrementAttempts,
  hasContextAlreadyBeenShared,
} from './circuit-breaker';

// Analysis
export {
  runReconciler,
} from './analysis';

// Sharing
export {
  generateShareSuggestionForDirection,
  generateShareOffer,
  respondToShareSuggestion,
  getShareSuggestionForUser,
  getSharedContextForGuesser,
  getSharedContentDeliveryStatus,
  generatePostShareContinuation,
  getFallbackContinuation,
  generateContextReceivedReflection,
} from './sharing';

// State
export {
  runReconcilerForDirection,
  checkAndRevealBothIfReady,
  hasPartnerCompletedStage1,
  getReconcilerStatus,
  generateReconcilerSummary,
} from './state';
