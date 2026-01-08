import { Router } from 'express';
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

// GET /memories - List all user memories
router.get('/', listMemories);

// POST /memories - Create new memory
router.post('/', createMemory);

// PUT /memories/:id - Update memory
router.put('/:id', updateMemory);

// DELETE /memories/:id - Delete memory
router.delete('/:id', deleteMemory);

// POST /memories/approve - Approve AI suggestion
router.post('/approve', approveMemory);

// POST /memories/reject - Reject AI suggestion
router.post('/reject', rejectMemory);

// POST /memories/format - AI-assisted memory creation (preview)
router.post('/format', formatMemory);

// POST /memories/confirm - Save AI-formatted memory
router.post('/confirm', confirmMemory);

// POST /memories/:id/update - AI-assisted memory update (preview)
router.post('/:id/update', updateMemoryAI);

// POST /memories/:id/confirm-update - Save AI-updated memory
router.post('/:id/confirm-update', confirmMemoryUpdate);

export default router;
