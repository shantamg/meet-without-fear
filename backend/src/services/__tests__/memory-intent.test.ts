/**
 * Memory Intent Tests
 *
 * Tests for memory intent determination and buffer size configuration.
 */

import {
  determineMemoryIntent,
  getTurnBufferSize,
  getStageConfig,
  type MemoryIntentContext,
} from '../memory-intent';

describe('Memory Intent', () => {
  describe('getTurnBufferSize', () => {
    /**
     * Buffer sizes were reduced after notable facts extraction feature.
     * Facts provide emotional context, situational facts, and relationship info
     * that would otherwise require extensive history.
     *
     * Target: 8-10 messages total (4-5 turns)
     */

    it('returns 5 turns for Stage 1 (witnessing)', () => {
      // Stage 1 needs some thread memory for witnessing
      expect(getTurnBufferSize(1, 'emotional_validation')).toBe(5);
      expect(getTurnBufferSize(1, 'recall_commitment')).toBe(5);
    });

    it('returns 4 turns for Stage 2 (empathy building)', () => {
      // Stage 2 empathy building is structured
      expect(getTurnBufferSize(2, 'emotional_validation')).toBe(4);
      expect(getTurnBufferSize(2, 'recall_commitment')).toBe(4);
    });

    it('returns 4 turns for Stage 3 (need confirmation)', () => {
      // Stage 3 need confirmation is procedural
      expect(getTurnBufferSize(3, 'emotional_validation')).toBe(4);
      expect(getTurnBufferSize(3, 'recall_commitment')).toBe(4);
    });

    it('returns 5 turns for Stage 4 (negotiation)', () => {
      // Stage 4 negotiation with facts context
      expect(getTurnBufferSize(4, 'emotional_validation')).toBe(5);
      expect(getTurnBufferSize(4, 'recall_commitment')).toBe(5);
    });

    it('returns 0 for avoid_recall intent', () => {
      expect(getTurnBufferSize(1, 'avoid_recall')).toBe(0);
      expect(getTurnBufferSize(2, 'avoid_recall')).toBe(0);
      expect(getTurnBufferSize(3, 'avoid_recall')).toBe(0);
      expect(getTurnBufferSize(4, 'avoid_recall')).toBe(0);
    });

    it('returns 2 for stage_enforcement intent', () => {
      expect(getTurnBufferSize(1, 'stage_enforcement')).toBe(2);
      expect(getTurnBufferSize(2, 'stage_enforcement')).toBe(2);
      expect(getTurnBufferSize(3, 'stage_enforcement')).toBe(2);
      expect(getTurnBufferSize(4, 'stage_enforcement')).toBe(2);
    });

    it('returns 4 for unknown stages', () => {
      expect(getTurnBufferSize(99, 'emotional_validation')).toBe(4);
    });
  });

  describe('getStageConfig', () => {
    it('returns conservative config for Stage 1', () => {
      const config = getStageConfig(1, 5);
      expect(config.threshold).toBe(0.65);
      expect(config.allowCrossSession).toBe(false);
      expect(config.surfaceStyle).toBe('silent');
    });

    it('returns no cross-session for Stage 1 early turns', () => {
      const config = getStageConfig(1, 2);
      expect(config.maxCrossSession).toBe(0);
    });

    it('returns moderate config for Stage 2', () => {
      const config = getStageConfig(2, 5);
      expect(config.threshold).toBe(0.55);
      expect(config.allowCrossSession).toBe(true);
      expect(config.surfaceStyle).toBe('tentative');
    });

    it('returns full config for Stage 3', () => {
      const config = getStageConfig(3, 5);
      expect(config.threshold).toBe(0.50);
      expect(config.maxCrossSession).toBe(10);
      expect(config.surfaceStyle).toBe('explicit');
    });

    it('returns full config for Stage 4', () => {
      const config = getStageConfig(4, 5);
      expect(config.threshold).toBe(0.50);
      expect(config.maxCrossSession).toBe(10);
      expect(config.surfaceStyle).toBe('explicit');
    });
  });

  describe('determineMemoryIntent', () => {
    const createContext = (overrides: Partial<MemoryIntentContext>): MemoryIntentContext => ({
      stage: 1,
      emotionalIntensity: 5,
      userMessage: 'Hello',
      turnCount: 5,
      sessionDurationMinutes: 10,
      isFirstTurnInSession: false,
      ...overrides,
    });

    it('returns avoid_recall for critical distress (intensity >= 9)', () => {
      const context = createContext({ emotionalIntensity: 9 });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('avoid_recall');
      expect(result.depth).toBe('none');
      expect(result.allowCrossSession).toBe(false);
    });

    it('returns avoid_recall for distress patterns', () => {
      const context = createContext({ userMessage: "I can't do this anymore" });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('avoid_recall');
      expect(result.depth).toBe('none');
    });

    it('returns emotional_validation for high intensity (8)', () => {
      const context = createContext({ emotionalIntensity: 8 });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('emotional_validation');
      expect(result.depth).toBe('minimal');
    });

    it('returns recall_commitment for commitment patterns', () => {
      const context = createContext({ userMessage: 'We agreed to do this differently' });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('recall_commitment');
      expect(result.depth).toBe('full');
      expect(result.allowCrossSession).toBe(true);
    });

    it('returns stage_enforcement for skip patterns', () => {
      const context = createContext({ userMessage: "Let's just skip this" });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('stage_enforcement');
      expect(result.depth).toBe('none');
    });

    it('returns offer_continuity for first turn of new session', () => {
      const context = createContext({
        isFirstTurnInSession: true,
        sessionDurationMinutes: 0,
      });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('offer_continuity');
      expect(result.depth).toBe('light');
    });

    it('returns emotional_validation for Stage 1 early turns', () => {
      const context = createContext({ stage: 1, turnCount: 2 });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('emotional_validation');
      expect(result.depth).toBe('minimal');
    });

    it('returns recall_commitment for Stage 3', () => {
      const context = createContext({ stage: 3 });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('recall_commitment');
      expect(result.depth).toBe('full');
    });

    it('returns recall_commitment for Stage 4', () => {
      const context = createContext({ stage: 4 });
      const result = determineMemoryIntent(context);

      expect(result.intent).toBe('recall_commitment');
      expect(result.depth).toBe('full');
    });
  });
});
