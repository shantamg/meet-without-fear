
import { Router } from 'express';
import { getSessions, getSessionLogs } from '../controllers/audit';

const router = Router();

// TODO: Add auth middleware if needed. For now, open for the internal tool but maybe restrict?
// The user said "We don't want to do it all the time in production... but I would like to be able to record...".
// Assuming this is for admin/dev usage.

router.get('/sessions', getSessions);
router.get('/sessions/:sessionId/logs', getSessionLogs);

export default router;
