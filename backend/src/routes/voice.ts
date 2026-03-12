/**
 * Voice Routes
 *
 * Endpoints for voice transcription token generation.
 * Mobile clients use POST /voice/token to obtain a short-lived
 * AssemblyAI WebSocket token for real-time transcription.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authRateLimit } from '../middleware/rate-limit';
import { getVoiceToken } from '../controllers/voice';

const router = Router();

// POST /voice/token — get short-lived AssemblyAI streaming token
router.post('/voice/token', requireAuth, authRateLimit, getVoiceToken);

export default router;
