/**
 * Memory Routes (Things to Always Remember)
 *
 * Routes for managing persistent user memories:
 * - GET /memories - List all user memories
 * - POST /memories - Create new memory (direct, requires category)
 * - PUT /memories/:id - Update memory (direct)
 * - DELETE /memories/:id - Delete memory
 * - POST /memories/approve - Approve AI suggestion from chat
 * - POST /memories/reject - Reject AI suggestion
 * - POST /memories/format - AI-assisted: format natural language to memory
 * - POST /memories/confirm - AI-assisted: save formatted memory
 * - POST /memories/:id/update - AI-assisted: request memory update
 * - POST /memories/:id/confirm-update - AI-assisted: save updated memory
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  approveMemory,
  rejectMemory,
  formatMemory,
  confirmMemory,
  updateMemoryAI,
  confirmMemoryUpdate,
} from '../controllers/memories';

const router = Router();

/**
 * @route GET /api/memories
 * @description List all user memories grouped by global/session
 * @access Private - requires authentication
 */
router.get('/memories', requireAuth, listMemories);

/**
 * @route POST /api/memories
 * @description Create a new memory
 * @access Private - requires authentication
 */
router.post('/memories', requireAuth, createMemory);

/**
 * @route PUT /api/memories/:id
 * @description Update an existing memory
 * @access Private - requires authentication
 */
router.put('/memories/:id', requireAuth, updateMemory);

/**
 * @route DELETE /api/memories/:id
 * @description Delete a memory
 * @access Private - requires authentication
 */
router.delete('/memories/:id', requireAuth, deleteMemory);

/**
 * @route POST /api/memories/approve
 * @description Approve an AI-suggested memory from chat
 * @access Private - requires authentication
 */
router.post('/memories/approve', requireAuth, approveMemory);

/**
 * @route POST /api/memories/reject
 * @description Reject an AI-suggested memory (tracked for analytics)
 * @access Private - requires authentication
 */
router.post('/memories/reject', requireAuth, rejectMemory);

/**
 * @route POST /api/memories/format
 * @description AI-assisted: format natural language input into a memory
 * @access Private - requires authentication
 */
router.post('/memories/format', requireAuth, formatMemory);

/**
 * @route POST /api/memories/confirm
 * @description Save an AI-formatted memory after user approval
 * @access Private - requires authentication
 */
router.post('/memories/confirm', requireAuth, confirmMemory);

/**
 * @route POST /api/memories/:id/update
 * @description AI-assisted: process a natural language update request
 * @access Private - requires authentication
 */
router.post('/memories/:id/update', requireAuth, updateMemoryAI);

/**
 * @route POST /api/memories/:id/confirm-update
 * @description Save an AI-updated memory after user approval
 * @access Private - requires authentication
 */
router.post('/memories/:id/confirm-update', requireAuth, confirmMemoryUpdate);

export default router;
