/**
 * Stage 3 Routes
 *
 * Routes for the What Matters stage of the Meet Without Fear process.
 * - GET /sessions/:id/needs - Get AI-synthesized needs
 * - POST /sessions/:id/needs/capture - Capture needs from an AI summary card
 * - POST /sessions/:id/needs/confirm - Confirm needs
 * - POST /sessions/:id/needs/consent - Consent to share needs
 * - POST /sessions/:id/needs/validate - Validate revealed needs/common ground
 * - GET /sessions/:id/common-ground - Get common ground analysis
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getNeeds,
  captureNeeds,
  confirmNeeds,
  consentToShareNeeds,
  validateNeeds,
  getCommonGround,
  addCustomNeed,
  confirmCommonGround,
  getNeedsComparison,
} from '../controllers/stage3';

const router = Router();

// Get AI-synthesized needs for the user
router.get(
  '/sessions/:id/needs',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getNeeds)
);

// Capture needs from an AI summary card
router.post(
  '/sessions/:id/needs/capture',
  requireAuth,
  requireSessionAccess,
  asyncHandler(captureNeeds)
);

// Confirm user's needs
router.post(
  '/sessions/:id/needs/confirm',
  requireAuth,
  requireSessionAccess,
  asyncHandler(confirmNeeds)
);

// Consent to share needs with partner
router.post(
  '/sessions/:id/needs/consent',
  requireAuth,
  requireSessionAccess,
  asyncHandler(consentToShareNeeds)
);

// Validate revealed needs/common ground
router.post(
  '/sessions/:id/needs/validate',
  requireAuth,
  requireSessionAccess,
  asyncHandler(validateNeeds)
);

// Get common ground analysis
router.get(
  '/sessions/:id/common-ground',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getCommonGround)
);

// Get needs comparison (side-by-side view of both users' needs + common ground)
router.get(
  '/sessions/:id/needs/comparison',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getNeedsComparison)
);

// Reveal alias for clients using the Stage 3 capture/consent/reveal/validation vocabulary
router.get(
  '/sessions/:id/needs/reveal',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getNeedsComparison)
);

// Add custom need
router.post(
  '/sessions/:id/needs',
  requireAuth,
  requireSessionAccess,
  asyncHandler(addCustomNeed)
);

// Confirm common ground
router.post(
  '/sessions/:id/common-ground/confirm',
  requireAuth,
  requireSessionAccess,
  asyncHandler(confirmCommonGround)
);

export default router;
