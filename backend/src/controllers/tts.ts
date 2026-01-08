import { Request, Response } from 'express';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const streamTTS = async (req: Request, res: Response): Promise<void | Response> => {
  try {
    if (!OPENAI_API_KEY) {
      console.error('[TTS] OPENAI_API_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Support both POST body and GET query params (for native downloadAsync compatibility)
    const text = req.body.text || req.query.text;
    const voice = req.body.voice || req.query.voice;
    const model = req.body.model || req.query.model;
    const speed = req.body.speed || req.query.speed;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Default to 'alloy' and 'tts-1' if not provided
    const voiceId = voice || 'alloy';
    let modelId = model || 'tts-1';
    const speechSpeed = typeof speed === 'string' ? parseFloat(speed) : (speed || 1.0);

    // Sanitize model - if it's a legacy ElevenLabs model or invalid, fallback to tts-1
    if (modelId !== 'tts-1' && modelId !== 'tts-1-hd') {
      console.warn(`[TTS] Invalid/Legacy model '${modelId}' requested. Falling back to 'tts-1'.`);
      modelId = 'tts-1';
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        input: text,
        voice: voiceId,
        speed: speechSpeed,
        response_format: 'opus', // Use opus for lower latency
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] OpenAI API error:', response.status, errorText);
      return res.status(response.status).json({ error: `OpenAI API error: ${errorText}` });
    }

    // Stream the audio back to the client
    res.setHeader('Content-Type', 'audio/ogg');

    if (response.body) {
      // Convert Web Stream to Node Stream for Express compatibility
      const { Readable } = require('stream');
      // @ts-ignore - Readable.fromWeb might not be in the types yet depending on node version
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.pipe(res);
    } else {
      throw new Error('No response body from OpenAI');
    }

  } catch (error) {
    console.error('[TTS] Error streaming audio:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error processing TTS' });
    }
  }
};
