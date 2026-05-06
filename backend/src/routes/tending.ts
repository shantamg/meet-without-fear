import { Router } from 'express';
import { requireAuth, requireSessionAccess } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import {
  getTendingEntries,
  postTendingReentry,
  postTendingResponse,
} from '../controllers/tending';

const router = Router();

router.get(
  '/sessions/:id/tending',
  requireAuth,
  requireSessionAccess,
  asyncHandler(getTendingEntries)
);

router.post(
  '/sessions/:id/tending/reentry',
  requireAuth,
  requireSessionAccess,
  asyncHandler(postTendingReentry)
);

router.post(
  '/sessions/:id/tending/:entryId/responses',
  requireAuth,
  requireSessionAccess,
  asyncHandler(postTendingResponse)
);

export default router;
