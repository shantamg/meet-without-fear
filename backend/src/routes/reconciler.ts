/**
 * Reconciler Routes
 *
 * Endpoints for the Empathy Reconciler system that analyzes gaps
 * between empathy guesses and actual feelings after Stage 2.
 *
 * All routes require authentication and are scoped to sessions.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  runReconcilerHandler,
  getReconcilerStatusHandler,
  getShareOfferHandler,
  respondToShareOfferHandler,
  getReconcilerSummaryHandler,
  skipShareOfferHandler,
} from '../controllers/reconciler';

const router = Router();

// All reconciler routes require authentication
router.use(requireAuth);

/**
 * Run reconciler analysis for a session
 * POST /sessions/:id/reconciler/run
 *
 * Analyzes empathy gaps in both directions (A→B and B→A).
 * Should be called after both users have shared their empathy statements.
 */
router.post('/sessions/:id/reconciler/run', runReconcilerHandler);

/**
 * Get reconciler status for a session
 * GET /sessions/:id/reconciler/status
 *
 * Returns whether reconciler has run, results, pending offers, and readiness.
 */
router.get('/sessions/:id/reconciler/status', getReconcilerStatusHandler);

/**
 * Get pending share offer for the current user
 * GET /sessions/:id/reconciler/share-offer
 *
 * Returns any pending share offer for the authenticated user.
 * Includes the offer message and quote options to choose from.
 */
router.get('/sessions/:id/reconciler/share-offer', getShareOfferHandler);

/**
 * Respond to a share offer
 * POST /sessions/:id/reconciler/share-offer/respond
 *
 * Accept (with selected quote or custom content) or decline the share offer.
 */
router.post('/sessions/:id/reconciler/share-offer/respond', respondToShareOfferHandler);

/**
 * Skip share offer without explicit response
 * POST /sessions/:id/reconciler/share-offer/skip
 *
 * Marks the share offer as skipped, allowing progression without sharing.
 */
router.post('/sessions/:id/reconciler/share-offer/skip', skipShareOfferHandler);

/**
 * Get reconciler summary after completion
 * GET /sessions/:id/reconciler/summary
 *
 * Returns an AI-generated summary of the empathy exchange.
 * Only available after reconciliation is complete.
 */
router.get('/sessions/:id/reconciler/summary', getReconcilerSummaryHandler);

export default router;
