/**
 * Stage 4 Routes
 *
 * Routes for the Strategic Repair stage of the Meet Without Fear process.
 * - GET /sessions/:id/strategies - Get anonymous strategy pool
 * - POST /sessions/:id/strategies - Propose a strategy
 * - GET /sessions/:id/stage4 - Get redesigned Stage 4 state
 * - POST /sessions/:id/strategies/rank - Submit ranking
 * - GET /sessions/:id/strategies/overlap - Get ranking overlap
 * - POST /sessions/:id/agreements - Create agreement
 * - POST /sessions/:id/agreements/:agreementId/confirm - Confirm agreement
 */

import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getStrategies,
  getStage4State,
  submitStage4ProposalSelection,
  submitStage4Selections,
  shareStage4Selections,
  unshareStage4Selections,
  closeStage4,
  proposeStrategy,
  submitRanking,
  getOverlap,
  createAgreement,
  confirmAgreement,
  requestSuggestions,
  markReady,
  getAgreements,
} from '../controllers/stage4';

const router = Router();

// Get redesigned Stage 4 state
router.get(
  '/sessions/:id/stage4',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getStage4State)
);

// Submit one redesigned Stage 4 per-proposal willingness decision
router.post(
  '/sessions/:id/stage4/proposals/:proposalId/selection',
  requireAuth,
  requireSessionAccess,
  asyncHandler(submitStage4ProposalSelection)
);

// Submit redesigned Stage 4 per-proposal willingness decisions
router.post(
  '/sessions/:id/stage4/selections',
  requireAuth,
  requireSessionAccess,
  asyncHandler(submitStage4Selections)
);

// Share current user's Stage 4 selections with their partner
router.post(
  '/sessions/:id/stage4/share-selections',
  requireAuth,
  requireSessionAccess,
  asyncHandler(shareStage4Selections)
);

// Withdraw current user's shared Stage 4 selections so they can revise
router.post(
  '/sessions/:id/stage4/unshare-selections',
  requireAuth,
  requireSessionAccess,
  asyncHandler(unshareStage4Selections)
);

// Close redesigned Stage 4 from willingness selections
router.post(
  '/sessions/:id/stage4/close',
  requireAuth,
  requireSessionAccess,
  asyncHandler(closeStage4)
);

// Get anonymous strategy pool
router.get(
  '/sessions/:id/strategies',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getStrategies)
);

// Propose a new strategy
router.post(
  '/sessions/:id/strategies',
  requireAuth,
  requireSessionAccess,
  asyncHandler(proposeStrategy)
);

// Submit strategy ranking
router.post(
  '/sessions/:id/strategies/rank',
  requireAuth,
  requireSessionAccess,
  asyncHandler(submitRanking)
);

// Get ranking overlap
router.get(
  '/sessions/:id/strategies/overlap',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getOverlap)
);

// Create agreement
router.post(
  '/sessions/:id/agreements',
  requireAuth,
  requireSessionAccess,
  asyncHandler(createAgreement)
);

// Confirm agreement
router.post(
  '/sessions/:id/agreements/:agreementId/confirm',
  requireAuth,
  requireSessionAccess,
  asyncHandler(confirmAgreement)
);

// Request AI strategy suggestions
router.post(
  '/sessions/:id/strategies/suggest',
  requireAuth,
  requireSessionAccess,
  asyncHandler(requestSuggestions)
);

// Mark ready to rank
router.post(
  '/sessions/:id/strategies/ready',
  requireAuth,
  requireSessionAccess,
  asyncHandler(markReady)
);

// Get agreements list
router.get(
  '/sessions/:id/agreements',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getAgreements)
);

export default router;
