/**
 * Meditation Script Utilities
 *
 * Utilities for parsing meditation scripts with timing tokens and calculating duration.
 * The standard format uses [PAUSE:Xs] tokens (e.g., [PAUSE:30s], [PAUSE:60s]).
 */

// ============================================================================
// Token Specification
// ============================================================================

/**
 * Meditation script token format:
 * - Pause: [PAUSE:Xs] where X is seconds (e.g., [PAUSE:30s], [PAUSE:60s])
 * - Bell (optional): [BELL] to indicate a bell sound
 *
 * Example script:
 * ```
 * Take a deep breath in... [PAUSE:5s]
 * And slowly exhale... [PAUSE:5s]
 * Now let's begin with a body scan. [PAUSE:3s]
 * Starting at the top of your head... [PAUSE:10s]
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface MeditationSegment {
  /** Type of segment */
  type: 'speech' | 'pause' | 'bell';
  /** Text content (for speech segments) */
  content?: string;
  /** Duration in seconds (for pause segments) */
  durationSeconds?: number;
}

export interface ParsedMeditationScript {
  /** Original raw script text */
  rawScript: string;
  /** Parsed segments in order */
  segments: MeditationSegment[];
  /** Total estimated duration in seconds */
  estimatedDurationSeconds: number;
  /** Total spoken word count */
  wordCount: number;
  /** Total pause time in seconds */
  totalPauseSeconds: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Estimated words per minute for meditation speech.
 * Meditation is typically slower than normal speech (120-150 WPM).
 * We use 100 WPM to account for the slower, deliberate pace.
 */
export const MEDITATION_WORDS_PER_MINUTE = 100;

/**
 * Pattern to match pause tokens: [PAUSE:Xs] or [PAUSE Xs] (both supported for backwards compat)
 * Examples: [PAUSE:30s], [PAUSE 60s], [PAUSE:5s]
 */
export const PAUSE_TOKEN_PATTERN = /\[PAUSE[:\s]+(\d+)s?\]/gi;

/**
 * Pattern to match bell tokens: [BELL]
 */
export const BELL_TOKEN_PATTERN = /\[BELL\]/gi;

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a meditation script into segments.
 *
 * Extracts pause tokens, bell markers, and spoken text sections.
 *
 * @param script - The raw meditation script with tokens
 * @returns Parsed script with segments and duration info
 *
 * @example
 * ```ts
 * const result = parseMeditationScript(
 *   "Take a breath. [PAUSE:5s] Exhale slowly. [PAUSE:3s]"
 * );
 * // result.segments = [
 * //   { type: 'speech', content: 'Take a breath.' },
 * //   { type: 'pause', durationSeconds: 5 },
 * //   { type: 'speech', content: 'Exhale slowly.' },
 * //   { type: 'pause', durationSeconds: 3 },
 * // ]
 * // result.estimatedDurationSeconds = 12 (4 words ~2.4s + 8s pause ≈ 10s)
 * ```
 */
export function parseMeditationScript(script: string): ParsedMeditationScript {
  const segments: MeditationSegment[] = [];
  let totalPauseSeconds = 0;
  let wordCount = 0;

  // Replace all tokens with a delimiter we can split on
  // Using a unique delimiter that won't appear in normal text
  const DELIMITER = '|||SEGMENT|||';

  // Replace pause tokens with delimiter + marker
  let processed = script.replace(PAUSE_TOKEN_PATTERN, (_, seconds) => {
    return `${DELIMITER}PAUSE:${seconds}${DELIMITER}`;
  });

  // Replace bell tokens with delimiter + marker
  processed = processed.replace(BELL_TOKEN_PATTERN, `${DELIMITER}BELL${DELIMITER}`);

  // Split by delimiter and process each segment
  const parts = processed.split(DELIMITER).filter((part) => part.trim().length > 0);

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.startsWith('PAUSE:')) {
      // Parse pause segment
      const seconds = parseInt(trimmed.replace('PAUSE:', ''), 10);
      if (!isNaN(seconds) && seconds > 0) {
        segments.push({
          type: 'pause',
          durationSeconds: seconds,
        });
        totalPauseSeconds += seconds;
      }
    } else if (trimmed === 'BELL') {
      // Bell segment
      segments.push({
        type: 'bell',
      });
    } else if (trimmed.length > 0) {
      // Speech segment
      segments.push({
        type: 'speech',
        content: trimmed,
      });
      // Count words (split on whitespace)
      wordCount += trimmed.split(/\s+/).filter((w) => w.length > 0).length;
    }
  }

  // Calculate estimated duration
  const speechDurationSeconds = (wordCount / MEDITATION_WORDS_PER_MINUTE) * 60;
  const estimatedDurationSeconds = Math.ceil(speechDurationSeconds + totalPauseSeconds);

  return {
    rawScript: script,
    segments,
    estimatedDurationSeconds,
    wordCount,
    totalPauseSeconds,
  };
}

/**
 * Calculate the estimated duration of a meditation script.
 *
 * Formula: (wordCount / 100) * 60 + totalPauseSeconds
 *
 * @param script - The raw meditation script with tokens
 * @returns Estimated duration in seconds
 *
 * @example
 * ```ts
 * const duration = calculateDuration("Hello world. [PAUSE:10s] Goodbye.");
 * // 3 words ≈ 1.8s speech + 10s pause = ~12s
 * ```
 */
export function calculateDuration(script: string): number {
  const parsed = parseMeditationScript(script);
  return parsed.estimatedDurationSeconds;
}

/**
 * Calculate duration and return formatted minutes.
 *
 * @param script - The raw meditation script with tokens
 * @returns Estimated duration as "approximately X minutes"
 */
export function formatDurationEstimate(script: string): string {
  const seconds = calculateDuration(script);
  const minutes = Math.ceil(seconds / 60);

  if (minutes === 1) {
    return 'approximately 1 minute';
  }
  return `approximately ${minutes} minutes`;
}

/**
 * Extract speech-only text from a meditation script.
 * Removes all tokens and returns just the spoken content.
 *
 * @param script - The raw meditation script with tokens
 * @returns Clean text without tokens
 */
export function extractSpeechText(script: string): string {
  return script
    .replace(PAUSE_TOKEN_PATTERN, '')
    .replace(BELL_TOKEN_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate that a meditation script has proper token formatting.
 *
 * @param script - The raw meditation script
 * @returns Array of validation issues (empty if valid)
 */
export function validateMeditationScript(script: string): string[] {
  const issues: string[] = [];

  // Check for malformed pause tokens (e.g., [PAUSE: without closing bracket)
  // We look for [PAUSE that isn't followed by a proper format ending with ]
  const malformedPause = script.match(/\[PAUSE(?![:\s]+\d+s?\])[^[\]]*\]/gi);
  if (malformedPause) {
    issues.push(`Malformed PAUSE token found: ${malformedPause[0]}`);
  }

  // Check for reasonable pause durations (max 5 minutes = 300s)
  const pauseMatches = script.matchAll(PAUSE_TOKEN_PATTERN);
  for (const match of pauseMatches) {
    const seconds = parseInt(match[1], 10);
    if (seconds > 300) {
      issues.push(`Pause duration ${seconds}s exceeds maximum of 300s`);
    }
    if (seconds < 1) {
      issues.push(`Pause duration ${seconds}s is too short (minimum 1s)`);
    }
  }

  // Check total pause time (max 30 minutes = 1800s)
  const parsed = parseMeditationScript(script);
  if (parsed.totalPauseSeconds > 1800) {
    issues.push(`Total pause time ${parsed.totalPauseSeconds}s exceeds maximum of 1800s`);
  }

  // Warn if no spoken content
  if (parsed.wordCount === 0) {
    issues.push('Script contains no spoken content');
  }

  return issues;
}
