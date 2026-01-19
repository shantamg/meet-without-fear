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

        expect(formatted).toContain('NOTED FACTS FROM THIS SESSION:');
        expect(formatted).toContain('[People]');
        expect(formatted).toContain('- User has a daughter named Emma who is 14');
        expect(formatted).toContain('[Logistics]');
        expect(formatted).toContain('- Partner works night shifts');
        expect(formatted).toContain('[Emotional]');
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
          notableFacts: [{ category: 'Emotional', fact: 'User feels overwhelmed' }],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('NOTED FACTS FROM THIS SESSION:');
        expect(formatted).toContain('[Emotional]');
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

        // Both People facts should be under the same [People] header
        expect(formatted).toContain('[People]');
        expect(formatted).toContain('- First person fact');
        expect(formatted).toContain('- Third person fact');
        expect(formatted).toContain('[Emotional]');
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

        expect(formatted).toContain('[Intensity:'); // HUD format
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
          notableFacts: [{ category: 'Emotional', fact: 'Notable fact here' }],
        });

        const formatted = formatContextForPrompt(bundle);
        const memoriesIndex = formatted.indexOf('USER MEMORIES');
        const factsIndex = formatted.indexOf('NOTED FACTS FROM THIS SESSION');

        expect(memoriesIndex).toBeGreaterThan(-1);
        expect(factsIndex).toBeGreaterThan(-1);
        expect(factsIndex).toBeGreaterThan(memoriesIndex);
      });
    });

    describe('Global Facts Formatting', () => {
      it('formats global facts at top of context', () => {
        const bundle = createMinimalBundle({
          globalFacts: [
            { category: 'People', fact: 'Has a partner named Alex' },
            { category: 'History', fact: 'Together for 5 years' },
          ],
        });

        const formatted = formatContextForPrompt(bundle);

        expect(formatted).toContain('ABOUT THIS USER (from previous sessions):');
        expect(formatted).toContain('[People]');
        expect(formatted).toContain('- Has a partner named Alex');
        expect(formatted).toContain('[History]');
        expect(formatted).toContain('- Together for 5 years');
      });

      it('places global facts before emotional state', () => {
        const bundle = createMinimalBundle({
          globalFacts: [{ category: 'People', fact: 'Has a dog named Max' }],
          emotionalThread: {
            initialIntensity: 5,
            currentIntensity: 7,
            trend: 'escalating',
            notableShifts: [],
          },
        });

        const formatted = formatContextForPrompt(bundle);
        const globalIndex = formatted.indexOf('ABOUT THIS USER');
        const emotionalIndex = formatted.indexOf('[Intensity:'); // HUD format

        expect(globalIndex).toBeGreaterThan(-1);
        expect(emotionalIndex).toBeGreaterThan(-1);
        expect(globalIndex).toBeLessThan(emotionalIndex);
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
        expect(formatted).toContain('NOTED FACTS FROM THIS SESSION');
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
        expect(formatted).toContain('NOTED FACTS FROM THIS SESSION');
        expect(formatted).toContain('USER MEMORIES');
        expect(formatted).toContain('[Intensity:'); // HUD format

        // Forbidden content (cross-session)
        expect(formatted).not.toContain('ABOUT THIS USER (from previous sessions)');
      });
    });
  });
});
