/**
 * Inner Thoughts Routes
 *
 * Routes for Inner Thoughts (solo self-reflection) session operations.
 * Sessions can optionally be linked to partner sessions for context-aware reflection.
 *
 * Routes:
 * - POST /inner-thoughts - Create new Inner Thoughts session
 * - GET /inner-thoughts - List Inner Thoughts sessions
 * - GET /inner-thoughts/:id - Get session with messages
 * - POST /inner-thoughts/:id/messages - Send message and get AI response
 * - PATCH /inner-thoughts/:id - Update session (title, status)
 * - DELETE /inner-thoughts/:id - Archive session
 *
 * Legacy routes (for backwards compatibility):
 * - POST /inner-work - Create new session
 * - GET /inner-work - List sessions
 * - GET /inner-work/:id - Get session
 * - POST /inner-work/:id/messages - Send message
 * - PATCH /inner-work/:id - Update session
 * - DELETE /inner-work/:id - Archive session
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createInnerWorkSession,
  listInnerWorkSessions,
  getInnerWorkSession,
  getInnerWorkOverview,
  sendInnerWorkMessage,
  updateInnerWorkSession,
  archiveInnerWorkSession,
} from '../controllers/inner-work';

const router = Router();

// All Inner Thoughts routes require authentication
router.use(requireAuth);

// ============================================================================
// New Routes: /inner-thoughts
// ============================================================================

/**
 * @route POST /api/v1/inner-thoughts
 * @description Create a new Inner Thoughts session (optionally linked to partner session)
 * @access Private
 */
router.post('/inner-thoughts', createInnerWorkSession);

/**
 * @route GET /api/v1/inner-thoughts
 * @description List Inner Thoughts sessions for the current user
 * @access Private
 */
router.get('/inner-thoughts', listInnerWorkSessions);

/**
 * @route GET /api/v1/inner-thoughts/overview
 * @description Get Inner Work hub overview (aggregated stats)
 * @access Private
 */
router.get('/inner-thoughts/overview', getInnerWorkOverview);

/**
 * @route GET /api/v1/inner-thoughts/:id
 * @description Get Inner Thoughts session details with messages
 * @access Private
 */
router.get('/inner-thoughts/:id', getInnerWorkSession);

/**
 * @route POST /api/v1/inner-thoughts/:id/messages
 * @description Send a message and get AI response
 * @access Private
 */
router.post('/inner-thoughts/:id/messages', sendInnerWorkMessage);

/**
 * @route PATCH /api/v1/inner-thoughts/:id
 * @description Update Inner Thoughts session (title, status)
 * @access Private
 */
router.patch('/inner-thoughts/:id', updateInnerWorkSession);

/**
 * @route DELETE /api/v1/inner-thoughts/:id
 * @description Archive Inner Thoughts session
 * @access Private
 */
router.delete('/inner-thoughts/:id', archiveInnerWorkSession);

// ============================================================================
// Legacy Routes: /inner-work (for backwards compatibility)
// ============================================================================

router.post('/inner-work', createInnerWorkSession);
router.get('/inner-work', listInnerWorkSessions);
router.get('/inner-work/overview', getInnerWorkOverview); // Must be before /:id
router.get('/inner-work/:id', getInnerWorkSession);
router.post('/inner-work/:id/messages', sendInnerWorkMessage);
router.patch('/inner-work/:id', updateInnerWorkSession);
router.delete('/inner-work/:id', archiveInnerWorkSession);

export default router;
