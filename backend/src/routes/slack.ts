/**
 * Slack Ingress Routes
 *
 * Public routes (no Clerk auth) that the EC2 socket listener POSTs into.
 * Protected with a shared secret (SLACK_INGRESS_SECRET) validated inside the
 * controller.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errors';
import { handleMwfSessionMessage, slackHealth } from '../controllers/slack-session';

const router = Router();

router.get('/slack/health', slackHealth);
router.post('/slack/mwf-session', asyncHandler(handleMwfSessionMessage));

export default router;
