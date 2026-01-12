/**
 * Meditation Utility Tests
 */

import {
  parseMeditationScript,
  calculateDuration,
  formatDurationEstimate,
  extractSpeechText,
  validateMeditationScript,
  MEDITATION_WORDS_PER_MINUTE,
} from '../meditation';

describe('parseMeditationScript', () => {
  it('should parse simple script with pause tokens', () => {
    const script = 'Take a breath. [PAUSE:5s] Exhale slowly.';
    const result = parseMeditationScript(script);

    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ type: 'speech', content: 'Take a breath.' });
    expect(result.segments[1]).toEqual({ type: 'pause', durationSeconds: 5 });
    expect(result.segments[2]).toEqual({ type: 'speech', content: 'Exhale slowly.' });
  });

  it('should handle pause tokens without "s" suffix', () => {
    const script = 'Breathe. [PAUSE:10] Rest.';
    const result = parseMeditationScript(script);

    expect(result.segments).toHaveLength(3);
    expect(result.segments[1]).toEqual({ type: 'pause', durationSeconds: 10 });
  });

  it('should handle legacy format with space instead of colon', () => {
    const script = 'Inhale. [PAUSE 30s] Exhale.';
    const result = parseMeditationScript(script);

    expect(result.segments).toHaveLength(3);
    expect(result.segments[1]).toEqual({ type: 'pause', durationSeconds: 30 });
  });

  it('should parse bell tokens', () => {
    const script = '[BELL] Begin your practice. [PAUSE:10s] [BELL]';
    const result = parseMeditationScript(script);

    expect(result.segments).toHaveLength(4);
    expect(result.segments[0]).toEqual({ type: 'bell' });
    expect(result.segments[1]).toEqual({ type: 'speech', content: 'Begin your practice.' });
    expect(result.segments[2]).toEqual({ type: 'pause', durationSeconds: 10 });
    expect(result.segments[3]).toEqual({ type: 'bell' });
  });

  it('should calculate total pause seconds correctly', () => {
    const script = 'A [PAUSE:5s] B [PAUSE:10s] C [PAUSE:15s]';
    const result = parseMeditationScript(script);

    expect(result.totalPauseSeconds).toBe(30);
  });

  it('should count words correctly', () => {
    const script = 'One two three. [PAUSE:5s] Four five six seven.';
    const result = parseMeditationScript(script);

    expect(result.wordCount).toBe(7);
  });

  it('should calculate estimated duration', () => {
    // 100 words at 100 WPM = 60 seconds
    // Plus 30 seconds of pauses = 90 seconds
    const words = Array(100).fill('word').join(' ');
    const script = `${words} [PAUSE:30s]`;
    const result = parseMeditationScript(script);

    expect(result.estimatedDurationSeconds).toBe(90);
  });

  it('should handle empty script', () => {
    const result = parseMeditationScript('');

    expect(result.segments).toHaveLength(0);
    expect(result.wordCount).toBe(0);
    expect(result.totalPauseSeconds).toBe(0);
  });

  it('should handle script with only pauses', () => {
    const script = '[PAUSE:10s] [PAUSE:20s]';
    const result = parseMeditationScript(script);

    expect(result.segments).toHaveLength(2);
    expect(result.wordCount).toBe(0);
    expect(result.totalPauseSeconds).toBe(30);
  });

  it('should handle multiple consecutive pause tokens', () => {
    const script = 'Start. [PAUSE:5s][PAUSE:10s] End.';
    const result = parseMeditationScript(script);

    expect(result.segments).toHaveLength(4);
    expect(result.totalPauseSeconds).toBe(15);
  });
});

describe('calculateDuration', () => {
  it('should return 0 for empty script', () => {
    expect(calculateDuration('')).toBe(0);
  });

  it('should calculate speech-only duration', () => {
    // 50 words at 100 WPM = 30 seconds
    const words = Array(50).fill('word').join(' ');
    const duration = calculateDuration(words);

    expect(duration).toBe(30);
  });

  it('should include pause time in calculation', () => {
    const script = 'Word. [PAUSE:60s]';
    const duration = calculateDuration(script);

    // 1 word ≈ 0.6s + 60s pause = ~61s
    expect(duration).toBeGreaterThanOrEqual(60);
  });
});

describe('formatDurationEstimate', () => {
  it('should format as "approximately 1 minute" for short scripts', () => {
    const script = 'Short script. [PAUSE:30s]';
    const formatted = formatDurationEstimate(script);

    expect(formatted).toBe('approximately 1 minute');
  });

  it('should format as "approximately X minutes" for longer scripts', () => {
    // Create a script that's about 5 minutes (300 seconds of pauses)
    const script = 'Content. [PAUSE:300s]';
    const formatted = formatDurationEstimate(script);

    expect(formatted).toMatch(/approximately \d+ minutes/);
  });
});

describe('extractSpeechText', () => {
  it('should remove pause tokens', () => {
    const script = 'Hello [PAUSE:5s] world [PAUSE:10s] today.';
    const text = extractSpeechText(script);

    expect(text).toBe('Hello world today.');
  });

  it('should remove bell tokens', () => {
    const script = '[BELL] Welcome. [BELL]';
    const text = extractSpeechText(script);

    expect(text).toBe('Welcome.');
  });

  it('should normalize whitespace', () => {
    const script = 'Hello   [PAUSE:5s]   world.';
    const text = extractSpeechText(script);

    expect(text).toBe('Hello world.');
  });
});

describe('validateMeditationScript', () => {
  it('should return empty array for valid script', () => {
    const script = 'Valid meditation. [PAUSE:30s] Continue. [PAUSE:60s]';
    const issues = validateMeditationScript(script);

    expect(issues).toHaveLength(0);
  });

  it('should detect pause duration exceeding maximum', () => {
    const script = 'Too long. [PAUSE:400s]';
    const issues = validateMeditationScript(script);

    expect(issues.some((i) => i.includes('exceeds maximum'))).toBe(true);
  });

  it('should detect total pause time exceeding maximum', () => {
    // 10 pauses of 200s each = 2000s (exceeds 1800s max)
    const pauses = Array(10).fill('[PAUSE:200s]').join(' ');
    const script = `Content. ${pauses}`;
    const issues = validateMeditationScript(script);

    expect(issues.some((i) => i.includes('Total pause time'))).toBe(true);
  });

  it('should warn about scripts with no spoken content', () => {
    const script = '[PAUSE:30s] [PAUSE:60s]';
    const issues = validateMeditationScript(script);

    expect(issues.some((i) => i.includes('no spoken content'))).toBe(true);
  });

  it('should accept valid pause durations', () => {
    const script = 'Valid. [PAUSE:1s] Also valid. [PAUSE:300s]';
    const issues = validateMeditationScript(script);

    expect(issues).toHaveLength(0);
  });
});
