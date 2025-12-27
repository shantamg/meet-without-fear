/**
 * Stage 0 Routes - Curiosity Compact
 *
 * Endpoints for signing and checking status of the Curiosity Compact.
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { signCompact, getCompactStatus } from '../controllers/stage0';

const router = Router();

/**
 * @route POST /api/v1/sessions/:sessionId/compact/sign
 * @description Sign the Curiosity Compact for a session
 * @access Private - requires authentication and session access
 */
router.post(
  '/sessions/:sessionId/compact/sign',
  requireAuth,
  requireSessionAccess,
  signCompact
);

/**
 * @route GET /api/v1/sessions/:sessionId/compact/status
 * @description Get the compact signing status for a session
 * @access Private - requires authentication and session access
 */
router.get(
  '/sessions/:sessionId/compact/status',
  requireAuth,
  requireSessionAccess,
  getCompactStatus
);

export default router;
