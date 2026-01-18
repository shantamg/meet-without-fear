/**
 * Session Routes
 *
 * Routes for session-level operations:
 * - GET /sessions/:id - Get session details
 * - GET /sessions/:id/state - Get consolidated session state (all data in one request)
 * - GET /sessions/:id/timeline - Get unified timeline (messages, indicators, emotions)
 * - POST /sessions/:id/pause - Pause active session
 * - POST /sessions/:id/resume - Resume paused session
 * - GET /sessions/:id/progress - Get stage progress
 * - POST /sessions/:id/resolve - Resolve session
 * - POST /sessions/:id/stages/advance - Advance to next stage
 * - GET /sessions/:id/inner-thoughts - Get linked Inner Thoughts session
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getSession,
  pauseSession,
  resumeSession,
  getProgress,
  resolveSession,
  advanceStage,
  getInvitation,
  updateInvitationMessage,
  confirmInvitationMessage,
  markSessionViewed,
  getUnreadSessionCount,
} from '../controllers/sessions';
import { getSessionState } from '../controllers/session-state';
import { getLinkedInnerThoughts } from '../controllers/inner-work';
import { getTimeline } from '../controllers/timeline';

const router = Router();

/**
 * @route GET /api/v1/sessions/unread-count
 * @description Get count of sessions with unread content (for tab badge)
 * @access Private - requires authentication
 * NOTE: This must be defined BEFORE /sessions/:id to avoid matching "unread-count" as an id
 */
router.get('/sessions/unread-count', requireAuth, asyncHandler(getUnreadSessionCount));

/**
 * @route GET /api/v1/sessions/:id
 * @description Get session details
 * @access Private - requires authentication and session access
 */
router.get('/sessions/:id', requireAuth, requireSessionAccess, asyncHandler(getSession));

/**
 * @route GET /api/v1/sessions/:id/state
 * @description Get consolidated session state (all data in one request)
 * @access Private - requires authentication and session access
 */
router.get('/sessions/:id/state', requireAuth, requireSessionAccess, asyncHandler(getSessionState));

/**
 * @route GET /api/v1/sessions/:id/timeline
 * @description Get unified timeline (messages, indicators, emotion changes)
 * @access Private - requires authentication and session access
 * @query before - ISO timestamp cursor (return items before this time)
 * @query limit - Maximum message items (default 20, max 100)
 */
router.get('/sessions/:id/timeline', requireAuth, requireSessionAccess, asyncHandler(getTimeline));

/**
 * @route POST /api/v1/sessions/:id/pause
 * @description Pause an active session
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/pause', requireAuth, requireSessionAccess, asyncHandler(pauseSession));

/**
 * @route POST /api/v1/sessions/:id/resume
 * @description Resume a paused session
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/resume', requireAuth, requireSessionAccess, asyncHandler(resumeSession));

/**
 * @route GET /api/v1/sessions/:id/progress
 * @description Get stage progress for both users
 * @access Private - requires authentication and session access
 */
router.get('/sessions/:id/progress', requireAuth, requireSessionAccess, asyncHandler(getProgress));

/**
 * @route POST /api/v1/sessions/:id/resolve
 * @description Resolve session after agreements are reached
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/resolve', requireAuth, requireSessionAccess, asyncHandler(resolveSession));

/**
 * @route POST /api/v1/sessions/:id/stages/advance
 * @description Advance to the next stage
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/stages/advance', requireAuth, requireSessionAccess, asyncHandler(advanceStage));

/**
 * @route GET /api/v1/sessions/:id/invitation
 * @description Get invitation details for a session
 * @access Private - requires authentication and session access
 */
router.get('/sessions/:id/invitation', requireAuth, requireSessionAccess, asyncHandler(getInvitation));

/**
 * @route PUT /api/v1/sessions/:id/invitation/message
 * @description Update invitation message
 * @access Private - requires authentication and session access
 */
router.put('/sessions/:id/invitation/message', requireAuth, requireSessionAccess, asyncHandler(updateInvitationMessage));

/**
 * @route POST /api/v1/sessions/:id/invitation/confirm
 * @description Confirm invitation message (ready to share)
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/invitation/confirm', requireAuth, requireSessionAccess, asyncHandler(confirmInvitationMessage));

/**
 * @route GET /api/v1/sessions/:id/inner-thoughts
 * @description Get linked Inner Thoughts session for this partner session
 * @access Private - requires authentication
 */
router.get('/sessions/:id/inner-thoughts', requireAuth, getLinkedInnerThoughts);

/**
 * @route POST /api/v1/sessions/:id/viewed
 * @description Mark session as viewed (updates lastViewedAt and lastSeenChatItemId)
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/viewed', requireAuth, requireSessionAccess, asyncHandler(markSessionViewed));

export default router;
