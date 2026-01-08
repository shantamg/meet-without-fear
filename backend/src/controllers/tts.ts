/**
 * TTS Controller
 *
 * Streams text-to-speech audio from OpenAI.
 * Supports eager generation - if audio was prefetched by AudioService,
 * it streams from disk (instant). Otherwise generates on the fly.
 */

import { Request, Response } from 'express';
import fs from 'fs';
import { Readable } from 'stream';
import { AudioService } from '../services/audioService';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const streamTTS = async (req: Request, res: Response): Promise<void | Response> => {
  try {
    if (!OPENAI_API_KEY) {
      console.error('[TTS] OPENAI_API_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Support both POST body and GET query params (for native downloadAsync compatibility)
    const text = (req.body.text || req.query.text) as string | undefined;
    const voice = req.body.voice || req.query.voice;
    const model = req.body.model || req.query.model;
    const speed = req.body.speed || req.query.speed;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Default to 'alloy' and 'tts-1' if not provided
    const voiceId = (voice as string) || 'alloy';
    let modelId = (model as string) || 'tts-1';
    const speechSpeed = typeof speed === 'string' ? parseFloat(speed) : (speed || 1.0);

    // Sanitize model - if it's a legacy ElevenLabs model or invalid, fallback to tts-1
    if (modelId !== 'tts-1' && modelId !== 'tts-1-hd') {
      console.warn(`[TTS] Invalid/Legacy model '${modelId}' requested. Falling back to 'tts-1'.`);
      modelId = 'tts-1';
    }

    // 1. Check if audio was prefetched (eager generation)
    const cachedPath = await AudioService.getPath(text, voiceId, speechSpeed);

    if (cachedPath) {
      // HIT! Stream from disk (instant)
      console.log('[TTS] Serving prefetched audio from disk');
      res.setHeader('Content-Type', 'audio/ogg');
      const readStream = fs.createReadStream(cachedPath);
      readStream.pipe(res);
      return;
    }

    // 2. MISS - Generate on the fly
    // Use AudioService.prefetch to ensure caching and deduplication
    console.log('[TTS] Cache miss - generating on the fly');

    try {
      // Start generation (this also caches it)
      const filePath = await AudioService.prefetch(text, voiceId, modelId, speechSpeed);

      // Stream the generated file
      res.setHeader('Content-Type', 'audio/ogg');
      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
    } catch (genError) {
      // If prefetch fails, fall back to direct streaming without caching
      console.error('[TTS] Prefetch failed, falling back to direct stream:', genError);

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          input: text,
          voice: voiceId,
          speed: speechSpeed,
          response_format: 'opus',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS] OpenAI API error:', response.status, errorText);
        return res.status(response.status).json({ error: `OpenAI API error: ${errorText}` });
      }

      res.setHeader('Content-Type', 'audio/ogg');

      if (response.body) {
        // @ts-ignore - Readable.fromWeb requires Node 18+
        const nodeStream = Readable.fromWeb(response.body);
        nodeStream.pipe(res);
      } else {
        throw new Error('No response body from OpenAI');
      }
    }
  } catch (error) {
    console.error('[TTS] Error streaming audio:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error processing TTS' });
    }
  }
};

/**
 * Prefetch TTS audio for a message.
 * Called by message handlers to start generation early.
 */
export const prefetchTTS = (
  text: string,
  voiceId: string = 'alloy',
  model: string = 'tts-1',
  speed: number = 1.0
): void => {
  // Fire and forget - don't await
  AudioService.prefetch(text, voiceId, model, speed).catch((err) => {
    console.error('[TTS] Background prefetch failed:', err);
  });
};
