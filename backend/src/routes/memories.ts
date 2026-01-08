import { Router } from 'express';
import { memoryService } from '../services/memory-service';

const router = Router();

// Get all pending memories for the user
router.get('/pending', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    const memories = await memoryService.getPendingMemories(userId);
    res.json(memories);
  } catch (error) {
    console.error('Failed to fetch pending memories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve a pending memory
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const memory = await memoryService.approveMemory(id);
    res.json(memory);
  } catch (error) {
    console.error('Failed to approve memory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject a pending memory
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const memory = await memoryService.rejectMemory(id);
    res.json(memory);
  } catch (error) {
    console.error('Failed to reject memory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
