/**
 * Audio Service - Eager TTS Generation
 *
 * Manages background audio generation and deduplication.
 * Starts generating audio immediately when AI responds,
 * so it's ready by the time the client requests it.
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

// Map to track ongoing generation tasks
// Key: cacheKey (hash of text+voice+speed), Value: Promise that resolves to the file path
const pendingAudioTasks = new Map<string, Promise<string>>();

const CACHE_DIR = path.join(__dirname, '../../cache/audio');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate a cache key from text and voice settings.
 * Same algorithm as mobile client for consistency.
 */
function generateCacheKey(text: string, voiceId: string, speed: number): string {
  let hash = 0;
  const input = `${voiceId}_${speed}_${text}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `${voiceId}_${speed}_${Math.abs(hash).toString(16)}`;
}

export const AudioService = {
  /**
   * Starts generating audio immediately.
   * If already generating, returns the existing promise.
   * Returns the file path when complete.
   */
  prefetch: (
    text: string,
    voiceId: string = 'alloy',
    model: string = 'tts-1',
    speed: number = 1.0
  ): Promise<string> => {
    const cacheKey = generateCacheKey(text, voiceId, speed);
    const filePath = path.join(CACHE_DIR, `${cacheKey}.ogg`);

    // 1. Check if we already have this task running
    if (pendingAudioTasks.has(cacheKey)) {
      console.log(`[AudioService] Joining existing task for ${cacheKey}`);
      return pendingAudioTasks.get(cacheKey)!;
    }

    // 2. Check if file already exists on disk (Persistent Cache)
    if (fs.existsSync(filePath)) {
      console.log(`[AudioService] Cache hit for ${cacheKey}`);
      return Promise.resolve(filePath);
    }

    // 3. Start the Task
    console.log(`[AudioService] Starting eager generation for ${cacheKey}`);

    const task = new Promise<string>(async (resolve, reject) => {
      try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            input: text,
            voice: voiceId,
            speed: speed,
            response_format: 'opus', // Use opus for best compression/quality
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
        }
        if (!response.body) throw new Error('No response body');

        // Write stream to disk
        const fileStream = fs.createWriteStream(filePath);

        // @ts-ignore - Readable.fromWeb requires Node 18+
        const nodeStream = Readable.fromWeb(response.body);

        nodeStream.pipe(fileStream);

        nodeStream.on('error', (err: Error) => {
          console.error('[AudioService] Stream Error:', err);
          // Clean up partial file
          fs.unlink(filePath, () => {});
          reject(err);
        });

        fileStream.on('finish', () => {
          console.log(`[AudioService] Finished writing ${cacheKey}`);
          resolve(filePath);
        });

        fileStream.on('error', (err: Error) => {
          console.error('[AudioService] File Write Error:', err);
          reject(err);
        });
      } catch (error) {
        console.error('[AudioService] Generation Failed:', error);
        // Clean up partial file if exists
        fs.unlink(filePath, () => {});
        reject(error);
      }
    });

    // Save task to map
    pendingAudioTasks.set(cacheKey, task);

    // Cleanup the map after task completes (success or failure)
    // Keep it for 30 seconds to allow concurrent requests to join
    task.finally(() => {
      setTimeout(() => pendingAudioTasks.delete(cacheKey), 30000);
    });

    return task;
  },

  /**
   * Get the file path if it exists or is being generated.
   * Returns null if not available and not being generated.
   */
  getPath: async (
    text: string,
    voiceId: string = 'alloy',
    speed: number = 1.0
  ): Promise<string | null> => {
    const cacheKey = generateCacheKey(text, voiceId, speed);
    const filePath = path.join(CACHE_DIR, `${cacheKey}.ogg`);

    // Check pending tasks first (will wait for completion)
    if (pendingAudioTasks.has(cacheKey)) {
      try {
        return await pendingAudioTasks.get(cacheKey)!;
      } catch {
        return null;
      }
    }

    // Check disk
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    return null;
  },

  /**
   * Get cache key for a given text/voice/speed combination.
   * Useful for checking if audio is cached without triggering generation.
   */
  getCacheKey: generateCacheKey,
};
