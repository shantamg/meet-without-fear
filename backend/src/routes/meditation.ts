/**
 * Meditation Routes ("Develop Loving Awareness")
 *
 * Routes for guided and unguided meditation sessions.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createSession,
  updateSession,
  listSessions,
  getSuggestion,
  generateScript,
  getStats,
  listFavorites,
  createFavorite,
  deleteFavorite,
  getPreferences,
  updatePreferences,
  listSavedMeditations,
  getSavedMeditation,
  createSavedMeditation,
  updateSavedMeditation,
  deleteSavedMeditation,
  parseMeditationText,
} from '../controllers/meditation';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/v1/meditation/stats - Get meditation statistics
router.get('/stats', getStats);

// GET /api/v1/meditation/favorites - List favorite meditations
router.get('/favorites', listFavorites);

// GET /api/v1/meditation/preferences - Get preferences
router.get('/preferences', getPreferences);

// PATCH /api/v1/meditation/preferences - Update preferences
router.patch('/preferences', updatePreferences);

// POST /api/v1/meditation/sessions - Create new session
router.post('/sessions', createSession);

// GET /api/v1/meditation/sessions - List sessions
router.get('/sessions', listSessions);

// PATCH /api/v1/meditation/sessions/:id - Update session (complete, etc.)
router.patch('/sessions/:id', updateSession);

// POST /api/v1/meditation/suggest - Get AI suggestion for meditation type
router.post('/suggest', getSuggestion);

// POST /api/v1/meditation/generate-script - Generate meditation script
router.post('/generate-script', generateScript);

// POST /api/v1/meditation/favorites - Create favorite
router.post('/favorites', createFavorite);

// DELETE /api/v1/meditation/favorites/:id - Delete favorite
router.delete('/favorites/:id', deleteFavorite);

// ============================================================================
// Saved Meditations (Custom User-Created)
// ============================================================================

// GET /api/v1/meditation/saved - List saved meditations
router.get('/saved', listSavedMeditations);

// GET /api/v1/meditation/saved/:id - Get specific saved meditation
router.get('/saved/:id', getSavedMeditation);

// POST /api/v1/meditation/saved - Create saved meditation
router.post('/saved', createSavedMeditation);

// PATCH /api/v1/meditation/saved/:id - Update saved meditation
router.patch('/saved/:id', updateSavedMeditation);

// DELETE /api/v1/meditation/saved/:id - Delete saved meditation
router.delete('/saved/:id', deleteSavedMeditation);

// POST /api/v1/meditation/parse - Parse text to structured format
router.post('/parse', parseMeditationText);

export default router;
