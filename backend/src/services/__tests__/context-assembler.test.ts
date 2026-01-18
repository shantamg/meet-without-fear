/**
 * Context Assembler Tests
 *
 * Tests for context bundle assembly including notable facts.
 */

import { formatContextForPrompt, type ContextBundle } from '../context-assembler';
import type { MemoryIntentResult } from '../memory-intent';

describe('Context Assembler', () => {
  describe('formatContextForPrompt', () => {
    // Create a minimal valid ContextBundle for testing
    const createMinimalBundle = (overrides?: Partial<ContextBundle>): ContextBundle => ({
      conversationContext: {
        recentTurns: [],
        turnCount: 0,
        sessionDurationMinutes: 0,
      },
      emotionalThread: {
        initialIntensity: null,
        currentIntensity: null,
        trend: 'unknown',
        notableShifts: [],
      },
      stageContext: {
        stage: 1,
        gatesSatisfied: {},
      },
      userName: 'User',
      intent: {
        intent: 'emotional_validation',
        depth: 'light',
        reason: 'Test context',
        threshold: 0.5,
        maxCrossSession: 0,
        allowCrossSession: false,
        surfaceStyle: 'silent',
      } as MemoryIntentResult,
      assembledAt: new Date().toISOString(),
      ...overrides,
    });

    describe('Notable Facts Formatting', () => {
      it('formats notable facts with correct header', () => {
        const bundle = createMinimalBundle({
          notableFacts: [
            'User has a daughter named Emma who is 14',
            'Partner works night shifts',
            'Feeling unheard about childcare decisions',
          ],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('NOTED FACTS FROM THIS SESSION:');
        expect(formatted).toContain('- User has a daughter named Emma who is 14');
        expect(formatted).toContain('- Partner works night shifts');
        expect(formatted).toContain('- Feeling unheard about childcare decisions');
      });

      it('does not include facts block when no facts exist', () => {
        const bundle = createMinimalBundle({
          notableFacts: undefined,
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).not.toContain('NOTED FACTS FROM THIS SESSION');
      });

      it('does not include facts block when facts array is empty', () => {
        const bundle = createMinimalBundle({
          notableFacts: [],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).not.toContain('NOTED FACTS FROM THIS SESSION');
      });

      it('formats single fact correctly', () => {
        const bundle = createMinimalBundle({
          notableFacts: ['User feels overwhelmed'],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('NOTED FACTS FROM THIS SESSION:');
        expect(formatted).toContain('- User feels overwhelmed');
      });

      it('preserves fact order', () => {
        const bundle = createMinimalBundle({
          notableFacts: ['First fact', 'Second fact', 'Third fact'],
        });

        const formatted = formatContextForPrompt(bundle);
        const lines = formatted.split('\n');
        const factLines = lines.filter((line) => line.startsWith('- '));

        expect(factLines[0]).toBe('- First fact');
        expect(factLines[1]).toBe('- Second fact');
        expect(factLines[2]).toBe('- Third fact');
      });
    });

    describe('Combined Context Formatting', () => {
      it('includes facts alongside other context elements', () => {
        const bundle = createMinimalBundle({
          emotionalThread: {
            initialIntensity: 5,
            currentIntensity: 7,
            trend: 'escalating',
            notableShifts: [],
          },
          userMemories: {
            global: [{ content: 'Call me Sam', category: 'PERSONAL_INFO' }],
            session: [],
          },
          notableFacts: ['Has two kids', 'Works from home'],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('EMOTIONAL STATE:');
        expect(formatted).toContain('USER MEMORIES');
        expect(formatted).toContain('NOTED FACTS FROM THIS SESSION:');
        expect(formatted).toContain('- Has two kids');
        expect(formatted).toContain('- Works from home');
      });

      it('places facts after user memories', () => {
        const bundle = createMinimalBundle({
          userMemories: {
            global: [{ content: 'User memory here', category: 'PREFERENCE' }],
            session: [],
          },
          notableFacts: ['Notable fact here'],
        });

        const formatted = formatContextForPrompt(bundle);
        const memoriesIndex = formatted.indexOf('USER MEMORIES');
        const factsIndex = formatted.indexOf('NOTED FACTS FROM THIS SESSION');

        expect(memoriesIndex).toBeGreaterThan(-1);
        expect(factsIndex).toBeGreaterThan(-1);
        expect(factsIndex).toBeGreaterThan(memoriesIndex);
      });
    });
  });
});
