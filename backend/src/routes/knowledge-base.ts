/**
 * Knowledge Base Routes
 *
 * Routes for browsing the knowledge base:
 * - GET /knowledge-base/topics - Browse sessions grouped by topic tag
 * - GET /knowledge-base/topics/:tag - View topic timeline (chronological)
 * - GET /knowledge-base/themes - Browse recurring themes (3+ session threshold)
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listTopics, getTopicTimeline, listRecurringThemes } from '../controllers/knowledge-base';

const router = Router();

router.use(requireAuth);

router.get('/knowledge-base/topics', listTopics);
router.get('/knowledge-base/topics/:tag', getTopicTimeline);
router.get('/knowledge-base/themes', listRecurringThemes);

export default router;
