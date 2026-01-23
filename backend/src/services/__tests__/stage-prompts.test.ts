import { buildStagePrompt, PromptContext, BuildStagePromptOptions, buildInnerWorkPrompt, InsightContext } from '../stage-prompts';
import { type ContextBundle } from '../context-assembler';
import { type MemoryIntentResult } from '../memory-intent';

describe('Stage Prompts Service', () => {
  // Create a minimal mock context bundle for tests
  const mockContextBundle: ContextBundle = {
    conversationContext: {
      recentTurns: [],
      turnCount: 0,
      sessionDurationMinutes: 5,
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
    userName: 'Test User',
    partnerName: 'Partner',
    intent: {
      intent: 'emotional_validation',
      depth: 'light',
      reason: 'Test',
    } as MemoryIntentResult,
    assembledAt: new Date().toISOString(),
  };

  const createContext = (overrides: Partial<PromptContext> = {}): PromptContext => ({
    userName: 'Test User',
    partnerName: 'Partner',
    turnCount: 1,
    emotionalIntensity: 5,
    contextBundle: mockContextBundle,
    ...overrides,
  });

  describe('buildStagePrompt', () => {
    it('returns Stage 1 prompt for stage 1', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      expect(prompt).toContain('Witness');
      expect(prompt).toContain('Test User');
      expect(prompt).toContain('feel fully heard');
    });

    it('returns Stage 2 prompt for stage 2', () => {
      const context = createContext();
      const prompt = buildStagePrompt(2, context);

      expect(prompt).toContain('Perspective Stretch');
      expect(prompt).toContain('Partner');
    });

    it('returns Stage 3 prompt for stage 3', () => {
      const context = createContext();
      const prompt = buildStagePrompt(3, context);

      expect(prompt).toContain('Need Mapping');
      expect(prompt).toContain('underlying needs');
    });

    it('returns Stage 4 prompt for stage 4', () => {
      const context = createContext();
      const prompt = buildStagePrompt(4, context);

      expect(prompt).toContain('Strategic Repair');
      expect(prompt).toContain('experiment');
    });

    it('returns invitation prompt for stage 0 with isInvitationPhase', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = buildStagePrompt(0, context, options);

      expect(prompt).toContain('invitation');
      expect(prompt).toContain('Partner');
    });
  });

  describe('Stage Transition Prompts', () => {
    it('returns transition prompt for Stage 0 → Stage 1', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 0,
      };
      const prompt = buildStagePrompt(1, context, options);

      // Should contain transition-specific content
      expect(prompt).toContain('just sent an invitation');
      expect(prompt).toContain('invite them to share');
      expect(prompt).toContain('Partner');
      // Should NOT explicitly name stages
      expect(prompt).not.toContain('"Stage 1"');
      expect(prompt).not.toContain('"witness stage"');
    });

    it('returns transition prompt for Stage 1 → Stage 2', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 1,
      };
      const prompt = buildStagePrompt(2, context, options);

      expect(prompt).toContain('feeling heard');
      expect(prompt).toContain('curiosity');
      expect(prompt).toContain('Partner');
    });

    it('returns transition prompt for Stage 2 → Stage 3', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 2,
      };
      const prompt = buildStagePrompt(3, context, options);

      expect(prompt).toContain('empathy');
      expect(prompt).toContain('need');
      expect(prompt).toContain('Partner');
    });

    it('returns transition prompt for Stage 3 → Stage 4', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 3,
      };
      const prompt = buildStagePrompt(4, context, options);

      expect(prompt).toContain('needs');
      expect(prompt).toContain('experiment');
      expect(prompt).toContain('Partner');
    });

    it('falls back to regular prompt when no transition match', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: undefined, // No previous stage info
      };
      const prompt = buildStagePrompt(1, context, options);

      // Should still return a valid Stage 1 prompt (either transition or regular)
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('includes user and partner names in transition prompts', () => {
      const context = createContext({
        userName: 'Alice',
        partnerName: 'Bob',
      });
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 0,
      };
      const prompt = buildStagePrompt(1, context, options);

      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Bob');
    });

    it('transition prompts use micro-tag format', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 0,
      };
      const prompt = buildStagePrompt(1, context, options);

      // Transition prompts use micro-tag format with <thinking> tags
      expect(prompt).toContain('<thinking>');
      expect(prompt).toContain('</thinking>');
      expect(prompt).toContain('OUTPUT FORMAT');
    });

    it('transition prompts do not explicitly name stages', () => {
      const context = createContext();

      // Test all transitions
      const transitions = [
        { toStage: 1, previousStage: 0 },
        { toStage: 2, previousStage: 1 },
        { toStage: 3, previousStage: 2 },
        { toStage: 4, previousStage: 3 },
      ];

      for (const { toStage, previousStage } of transitions) {
        const options: BuildStagePromptOptions = {
          isStageTransition: true,
          previousStage,
        };
        const prompt = buildStagePrompt(toStage, context, options);

        // Should not explicitly name stages (avoid clinical language)
        expect(prompt).not.toMatch(/["']Stage [0-4]["']/i);
        expect(prompt).not.toContain('Phase 1');
        expect(prompt).not.toContain('Phase 2');
      }
    });
  });

  describe('Regular prompts when not transitioning', () => {
    it('uses regular Stage 1 prompt when not transitioning', () => {
      const context = createContext({ turnCount: 3 });
      const options: BuildStagePromptOptions = {
        isStageTransition: false,
      };
      const prompt = buildStagePrompt(1, context, options);

      // Should be regular witness prompt, not transition
      expect(prompt).toContain('Witness stage');
      expect(prompt).toContain('Reflect and validate');
    });

    it('uses regular Stage 2 prompt when not transitioning', () => {
      const context = createContext({ turnCount: 5 });
      const options: BuildStagePromptOptions = {
        isStageTransition: false,
      };
      const prompt = buildStagePrompt(2, context, options);

      // Should be regular perspective prompt, not transition
      expect(prompt).toContain('LISTENING:');
      expect(prompt).toContain('BRIDGING:');
    });
  });

  describe('buildInnerWorkPrompt with insights', () => {
    it('includes insights in the prompt when provided', () => {
      const insights: InsightContext[] = [
        {
          type: 'PATTERN',
          summary: 'You frequently mention work stress in your reflections',
          confidence: 0.85,
        },
        {
          type: 'SUGGESTION',
          summary: 'Consider trying a short meditation before difficult conversations',
          relatedFeatures: ['meditation'],
        },
      ];

      const prompt = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
        insights,
      });

      expect(prompt).toContain('CROSS-FEATURE INSIGHTS');
      expect(prompt).toContain('Pattern noticed: You frequently mention work stress');
      expect(prompt).toContain('Suggestion: Consider trying a short meditation');
      expect(prompt).toContain('85%'); // confidence percentage
      expect(prompt).toContain('Weave observations naturally');
    });

    it('does not include insights section when no insights provided', () => {
      const prompt = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
        insights: [],
      });

      expect(prompt).not.toContain('CROSS-FEATURE INSIGHTS');
    });

    it('does not include insights section when insights is undefined', () => {
      const prompt = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
      });

      expect(prompt).not.toContain('CROSS-FEATURE INSIGHTS');
    });

    it('formats CONTRADICTION insights with appropriate label', () => {
      const insights: InsightContext[] = [
        {
          type: 'CONTRADICTION',
          summary: 'You say trust is important but mentioned avoiding vulnerability',
        },
      ];

      const prompt = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 3,
        insights,
      });

      expect(prompt).toContain('Something to explore: You say trust is important');
    });

    it('includes guidance on natural integration of insights', () => {
      const insights: InsightContext[] = [
        {
          type: 'PATTERN',
          summary: 'Test pattern',
        },
      ];

      const prompt = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 3,
        insights,
      });

      expect(prompt).toContain('HOW TO USE INSIGHTS');
      expect(prompt).toContain('Don\'t force insights');
      expect(prompt).toContain('EXAMPLES OF NATURAL INTEGRATION');
    });
  });

  describe('Response Protocol (Semantic Router)', () => {
    it('Stage 1 protocol includes FeelHeardCheck flag instruction', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      expect(prompt).toContain('<thinking>');
      // The flag instruction is in format "FeelHeardCheck: [Y if ready..., N otherwise]"
      expect(prompt).toContain('FeelHeardCheck:');
      expect(prompt).toMatch(/FeelHeardCheck.*Y.*N/s);
    });

    it('Stage 2 protocol includes ReadyShare flag instruction', () => {
      const context = createContext();
      const prompt = buildStagePrompt(2, context);

      expect(prompt).toContain('<thinking>');
      // The flag instruction is in format "ReadyShare: [Y if ready..., N otherwise]"
      expect(prompt).toContain('ReadyShare:');
      expect(prompt).toMatch(/ReadyShare.*Y.*N/s);
    });

    it('Stage 0 protocol includes draft tag instruction', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = buildStagePrompt(0, context, options);

      expect(prompt).toContain('<draft>');
    });

    it('protocol includes dispatch tag instruction', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      expect(prompt).toContain('<dispatch>');
      expect(prompt).toContain('EXPLAIN_PROCESS');
    });

    it('does NOT include old tool call instructions', () => {
      const context = createContext();
      const prompt = buildStagePrompt(1, context);

      // Should not have tool call instructions
      expect(prompt).not.toContain('update_session_state');
      expect(prompt).not.toContain('THIRD: Call');
    });
  });
});
