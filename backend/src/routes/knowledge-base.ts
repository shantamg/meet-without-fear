/**
 * Knowledge Base Routes
 *
 * Routes for browsing, searching, and linking in the knowledge base:
 * - GET  /knowledge-base/topics           - Browse sessions grouped by topic tag
 * - GET  /knowledge-base/topics/:tag      - View topic timeline (chronological)
 * - GET  /knowledge-base/themes           - Browse recurring themes (3+ session threshold)
 * - GET  /knowledge-base/search           - Semantic search across takeaways
 * - GET  /knowledge-base/recent           - Most recent takeaways
 * - GET  /knowledge-base/actions          - Action items with status filter
 * - GET  /knowledge-base/takeaways/:id/links   - Get linked takeaways
 * - POST /knowledge-base/takeaways/:id/links   - Create manual link
 * - DELETE /knowledge-base/takeaways/:id/links/:linkId - Remove manual link
 * - GET  /knowledge-base/takeaways/:id/thread  - Thought thread traversal
 * - PATCH /knowledge-base/takeaways/:id/resolve - Toggle action item resolved
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listTopics,
  getTopicTimeline,
  listRecurringThemes,
  searchKnowledgeBase,
  listRecentTakeaways,
  getTakeawayLinks,
  createTakeawayLink,
  deleteTakeawayLink,
  getTakeawayThread,
  resolveTakeaway,
  listActions,
} from '../controllers/knowledge-base';

const router = Router();

router.use(requireAuth);

// Browse
router.get('/knowledge-base/topics', listTopics);
router.get('/knowledge-base/topics/:tag', getTopicTimeline);
router.get('/knowledge-base/themes', listRecurringThemes);

// Search & Recent
router.get('/knowledge-base/search', searchKnowledgeBase);
router.get('/knowledge-base/recent', listRecentTakeaways);

// Action Items
router.get('/knowledge-base/actions', listActions);

// Takeaway Links & Thread
router.get('/knowledge-base/takeaways/:id/links', getTakeawayLinks);
router.post('/knowledge-base/takeaways/:id/links', createTakeawayLink);
router.delete('/knowledge-base/takeaways/:id/links/:linkId', deleteTakeawayLink);
router.get('/knowledge-base/takeaways/:id/thread', getTakeawayThread);

// Action Item Resolution
router.patch('/knowledge-base/takeaways/:id/resolve', resolveTakeaway);

export default router;
