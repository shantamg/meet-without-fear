/**
 * Stage 2 Routes
 *
 * Routes for the Perspective Stretch / Empathy stage of the Meet Without Fear process.
 * - POST /sessions/:id/empathy/draft - Save empathy draft
 * - GET /sessions/:id/empathy/draft - Get current draft
 * - POST /sessions/:id/empathy/consent - Consent to share
 * - GET /sessions/:id/empathy/partner - Get partner's empathy
 * - POST /sessions/:id/empathy/validate - Validate partner's empathy
 * - GET /sessions/:id/empathy/status - Get empathy exchange status
 * - POST /sessions/:id/empathy/refine - Refinement conversation (when NEEDS_WORK or REFINING)
 * - POST /sessions/:id/empathy/resubmit - Resubmit revised empathy statement
 *
 * NEW: Share suggestion flow (asymmetric reconciler)
 * - GET /sessions/:id/empathy/share-suggestion - Get share suggestion for current user
 * - POST /sessions/:id/empathy/share-suggestion/respond - Respond to share suggestion
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  saveDraft,
  getDraft,
  consentToShare,
  getPartnerEmpathy,
  validateEmpathy,
  getEmpathyExchangeStatus,
  refineEmpathy,
  resubmitEmpathy,
  getShareSuggestion,
  respondToShareSuggestion,
} from '../controllers/stage2';

const router = Router();

// Save empathy draft
router.post(
  '/sessions/:id/empathy/draft',
  requireAuth,
  requireSessionAccess,
  asyncHandler(saveDraft)
);

// Get current empathy draft
router.get(
  '/sessions/:id/empathy/draft',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getDraft)
);

// Consent to share empathy with partner
router.post(
  '/sessions/:id/empathy/consent',
  requireAuth,
  requireSessionAccess,
  asyncHandler(consentToShare)
);

// Get partner's empathy attempt
router.get(
  '/sessions/:id/empathy/partner',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getPartnerEmpathy)
);

// Validate partner's empathy attempt
router.post(
  '/sessions/:id/empathy/validate',
  requireAuth,
  requireSessionAccess,
  asyncHandler(validateEmpathy)
);

// Get empathy exchange status (for UI state management)
router.get(
  '/sessions/:id/empathy/status',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getEmpathyExchangeStatus)
);

// Refinement conversation (when status is NEEDS_WORK)
router.post(
  '/sessions/:id/empathy/refine',
  requireAuth,
  requireSessionAccess,
  asyncHandler(refineEmpathy)
);

// Resubmit revised empathy statement
router.post(
  '/sessions/:id/empathy/resubmit',
  requireAuth,
  requireSessionAccess,
  asyncHandler(resubmitEmpathy)
);

// ============================================================================
// Share Suggestion Flow (Asymmetric Reconciler)
// ============================================================================

// Get share suggestion for current user (called by subject when partner has gaps)
router.get(
  '/sessions/:id/empathy/share-suggestion',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getShareSuggestion)
);

// Respond to share suggestion (accept, decline, or refine)
router.post(
  '/sessions/:id/empathy/share-suggestion/respond',
  requireAuth,
  requireSessionAccess,
  asyncHandler(respondToShareSuggestion)
);

export default router;
