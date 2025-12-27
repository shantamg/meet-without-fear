/**
 * Stage 3 Routes
 *
 * Routes for the Need Mapping stage of the BeHeard process.
 * - GET /sessions/:id/needs - Get AI-synthesized needs
 * - POST /sessions/:id/needs/confirm - Confirm needs
 * - POST /sessions/:id/needs/consent - Consent to share needs
 * - GET /sessions/:id/common-ground - Get common ground analysis
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getNeeds,
  confirmNeeds,
  consentToShareNeeds,
  getCommonGround,
} from '../controllers/stage3';

const router = Router();

// Get AI-synthesized needs for the user
router.get(
  '/sessions/:id/needs',
  requireAuth,
  asyncHandler(getNeeds)
);

// Confirm user's needs
router.post(
  '/sessions/:id/needs/confirm',
  requireAuth,
  asyncHandler(confirmNeeds)
);

// Consent to share needs with partner
router.post(
  '/sessions/:id/needs/consent',
  requireAuth,
  asyncHandler(consentToShareNeeds)
);

// Get common ground analysis
router.get(
  '/sessions/:id/common-ground',
  requireAuth,
  asyncHandler(getCommonGround)
);

export default router;
