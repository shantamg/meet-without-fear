/**
 * Voice Controller
 *
 * Handles voice transcription token generation via AssemblyAI.
 * Mobile clients call POST /voice/token to get a short-lived WebSocket token,
 * then open a direct WebSocket to AssemblyAI for real-time transcription.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

const ASSEMBLYAI_TOKEN_URL = 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=300';

/**
 * POST /voice/token
 *
 * Returns a short-lived AssemblyAI streaming token.
 * Requires: requireAuth middleware (applied at route level).
 * Rate limit: authRateLimit — 30 req/min (applied at route level).
 */
export async function getVoiceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;

    if (!apiKey) {
      res.status(500).json({ success: false, error: 'Voice transcription not configured' });
      return;
    }

    const response = await fetch(ASSEMBLYAI_TOKEN_URL, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[Voice] AssemblyAI token request failed:', response.status, errorText);
      res.status(502).json({ success: false, error: 'Failed to obtain voice token' });
      return;
    }

    const data = (await response.json()) as { token: string };

    res.json({
      success: true,
      data: {
        token: data.token,
        expiresInSeconds: 300,
      },
    });
  } catch (error) {
    next(error);
  }
}
