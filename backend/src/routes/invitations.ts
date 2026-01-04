import { Router } from 'express';
import {
  listSessions,
  createSession,
  getInvitation,
  acceptInvitation,
  declineInvitation,
  acknowledgeInvitation,
  updateNickname,
  listPeople,
  archiveSession,
} from '../controllers/invitations';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';

const router = Router();

/**
 * @route GET /api/v1/sessions
 * @description List user's sessions
 * @access Private - requires authentication
 */
router.get('/sessions', requireAuth, asyncHandler(listSessions));

/**
 * @route POST /api/v1/sessions
 * @description Create a new session with an invitation
 * @access Private - requires authentication
 */
router.post('/sessions', requireAuth, asyncHandler(createSession));

/**
 * @route GET /api/v1/invitations/:id
 * @description Get invitation details (public info for accepting/declining)
 * @access Public - but only returns limited info
 */
router.get('/invitations/:id', asyncHandler(getInvitation));

/**
 * @route POST /api/v1/invitations/:id/accept
 * @description Accept an invitation and join the session
 * @access Private - requires authentication
 */
router.post('/invitations/:id/accept', requireAuth, asyncHandler(acceptInvitation));

/**
 * @route POST /api/v1/invitations/:id/decline
 * @description Decline an invitation
 * @access Private - requires authentication
 */
router.post('/invitations/:id/decline', requireAuth, asyncHandler(declineInvitation));

/**
 * @route POST /api/v1/invitations/:id/acknowledge
 * @description Acknowledge viewing a pending invitation (creates notification)
 * @access Private - requires authentication
 */
router.post('/invitations/:id/acknowledge', requireAuth, asyncHandler(acknowledgeInvitation));

/**
 * @route PATCH /api/v1/relationships/:relationshipId/nickname
 * @description Update the nickname for your partner in a relationship
 * @access Private - requires authentication
 */
router.patch('/relationships/:relationshipId/nickname', requireAuth, asyncHandler(updateNickname));

/**
 * @route GET /api/v1/people
 * @description List people the user has relationships with
 * @access Private - requires authentication
 */
router.get('/people', requireAuth, asyncHandler(listPeople));

/**
 * @route POST /api/v1/sessions/:id/archive
 * @description Archive a session (for resolved, abandoned, or pending sessions)
 * @access Private - requires authentication and session access
 */
router.post('/sessions/:id/archive', requireAuth, requireSessionAccess, asyncHandler(archiveSession));

export default router;
