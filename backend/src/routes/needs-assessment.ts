/**
 * Needs Assessment Routes ("Am I OK?")
 *
 * Routes for the 19 core human needs assessment system.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getNeedsReference,
  getNeedsState,
  submitBaseline,
  checkInNeed,
  getNeedHistory,
  updatePreferences,
} from '../controllers/needs-assessment';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/v1/needs/reference - Get all 19 needs reference data
router.get('/reference', getNeedsReference);

// GET /api/v1/needs/state - Get user's assessment state and current scores
router.get('/state', getNeedsState);

// POST /api/v1/needs/baseline - Submit initial baseline assessment
router.post('/baseline', submitBaseline);

// POST /api/v1/needs/:needId/check-in - Check in on a single need
router.post('/:needId/check-in', checkInNeed);

// GET /api/v1/needs/:needId/history - Get score history for a need
router.get('/:needId/history', getNeedHistory);

// PATCH /api/v1/needs/preferences - Update check-in preferences
router.patch('/preferences', updatePreferences);

export default router;
