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
      it('formats notable facts with categories', () => {
        const bundle = createMinimalBundle({
          notableFacts: [
            { category: 'People', fact: 'User has a daughter named Emma who is 14' },
            { category: 'Logistics', fact: 'Partner works night shifts' },
            { category: 'Emotional', fact: 'Feeling unheard about childcare decisions' },
          ],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('--- Notable facts ---');
        expect(formatted).toContain('- User has a daughter named Emma who is 14');
        expect(formatted).toContain('- Partner works night shifts');
        expect(formatted).toContain('- Feeling unheard about childcare decisions');
      });

      it('does not include facts block when no facts exist', () => {
        const bundle = createMinimalBundle({
          notableFacts: undefined,
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).not.toContain('--- Notable facts ---');
      });

      it('does not include facts block when facts array is empty', () => {
        const bundle = createMinimalBundle({
          notableFacts: [],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).not.toContain('--- Notable facts ---');
      });

      it('formats single fact correctly', () => {
        const bundle = createMinimalBundle({
          notableFacts: [{ category: 'Emotional', fact: 'User feels overwhelmed' }],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('--- Notable facts ---');
        expect(formatted).toContain('- User feels overwhelmed');
      });

      it('groups facts by category', () => {
        const bundle = createMinimalBundle({
          notableFacts: [
            { category: 'People', fact: 'First person fact' },
            { category: 'Emotional', fact: 'Second emotional fact' },
            { category: 'People', fact: 'Third person fact' },
          ],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('- First person fact');
        expect(formatted).toContain('- Third person fact');
        expect(formatted).toContain('- Second emotional fact');
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
          notableFacts: [
            { category: 'People', fact: 'Has two kids' },
            { category: 'Logistics', fact: 'Works from home' },
          ],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('Intensity:'); // HUD format
        expect(formatted).toContain('--- User preferences to honor ---');
        expect(formatted).toContain('--- Notable facts ---');
        expect(formatted).toContain('- Has two kids');
        expect(formatted).toContain('- Works from home');
      });

      it('places facts after user memories', () => {
        const bundle = createMinimalBundle({
          userMemories: {
            global: [{ content: 'User memory here', category: 'PREFERENCE' }],
            session: [],
          },
          notableFacts: [{ category: 'Emotional', fact: 'Notable fact here' }],
        });

        const formatted = formatContextForPrompt(bundle);
        const memoriesIndex = formatted.indexOf('--- User preferences to honor ---');
        const factsIndex = formatted.indexOf('--- Notable facts ---');

        expect(memoriesIndex).toBeGreaterThan(-1);
        expect(factsIndex).toBeGreaterThan(-1);
        expect(factsIndex).toBeGreaterThan(memoriesIndex);
      });
    });

    describe('Global Facts Formatting', () => {
      it('does not include global facts in compact context', () => {
        const bundle = createMinimalBundle({
          globalFacts: [
            { category: 'People', fact: 'Has a partner named Alex' },
            { category: 'History', fact: 'Together for 5 years' },
          ],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).not.toContain('ABOUT THIS USER');
        expect(formatted).not.toContain('Has a partner named Alex');
      });
    });

    describe('Session Isolation', () => {
      it('does not include global facts when undefined (session isolation)', () => {
        // Per session isolation spec: globalFacts should be undefined until consent UI is built
        const bundle = createMinimalBundle({
          globalFacts: undefined,
          // Session-specific facts should still work
          notableFacts: [{ category: 'Emotional', fact: 'User is feeling stressed' }],
        });

        const formatted = formatContextForPrompt(bundle);

        // Should NOT contain global facts section
        expect(formatted).not.toContain('ABOUT THIS USER (from previous sessions)');

        // Should still contain session-specific notable facts
        expect(formatted).toContain('--- Notable facts ---');
        expect(formatted).toContain('User is feeling stressed');
      });

      it('verifies session isolation - no cross-session context in stage 1', () => {
        // This test documents the expected behavior per the session isolation spec:
        // Stage 1 sessions should be a "clean slate" with only:
        // - Session-specific notable facts
        // - User memories
        // - Emotional thread
        // But NOT:
        // - Global facts from previous sessions
        const bundle = createMinimalBundle({
          globalFacts: undefined, // Disabled until consent UI
          notableFacts: [{ category: 'People', fact: 'Partner is named Alex' }],
          userMemories: {
            global: [{ content: 'Prefers to be called Sam', category: 'PERSONAL_INFO' }],
            session: [],
          },
          emotionalThread: {
            initialIntensity: 5,
            currentIntensity: 6,
            trend: 'stable',
            notableShifts: [],
          },
          stageContext: {
            stage: 1,
            gatesSatisfied: {},
          },
        });

        const formatted = formatContextForPrompt(bundle);

        // Allowed content for session isolation
        expect(formatted).toContain('--- Notable facts ---');
        expect(formatted).toContain('--- User preferences to honor ---');
        expect(formatted).toContain('Intensity:'); // HUD format

        // Forbidden content (cross-session)
        expect(formatted).not.toContain('ABOUT THIS USER (from previous sessions)');
      });
    });
  });
});
