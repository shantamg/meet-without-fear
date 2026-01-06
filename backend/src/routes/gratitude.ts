/**
 * Gratitude Practice Routes ("See the Positive")
 *
 * Routes for gratitude journaling and pattern recognition.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createGratitude,
  listGratitude,
  getGratitude,
  deleteGratitude,
  getPatterns,
  getPreferences,
  updatePreferences,
  getPrompt,
} from '../controllers/gratitude';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/v1/gratitude/patterns - Get aggregated patterns (must be before /:id)
router.get('/patterns', getPatterns);

// GET /api/v1/gratitude/preferences - Get preferences
router.get('/preferences', getPreferences);

// PATCH /api/v1/gratitude/preferences - Update preferences
router.patch('/preferences', updatePreferences);

// GET /api/v1/gratitude/prompt - Get contextual prompt
router.get('/prompt', getPrompt);

// POST /api/v1/gratitude - Create new entry
router.post('/', createGratitude);

// GET /api/v1/gratitude - List entries
router.get('/', listGratitude);

// GET /api/v1/gratitude/:id - Get single entry
router.get('/:id', getGratitude);

// DELETE /api/v1/gratitude/:id - Delete entry
router.delete('/:id', deleteGratitude);

export default router;
