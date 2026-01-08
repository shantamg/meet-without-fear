import { Router } from 'express';
import { streamTTS } from '../controllers/tts';
import { requireAuth } from '../middleware/auth'; // Ensure user is authenticated

const router = Router();

console.log('[Routes] Loading TTS routes...');

// Protect the route so only logged-in users can use TTS (saves costs)
// POST for standard requests, GET for native downloadAsync compatibility
router.post('/', requireAuth, streamTTS);
router.get('/', requireAuth, streamTTS);

export default router;
