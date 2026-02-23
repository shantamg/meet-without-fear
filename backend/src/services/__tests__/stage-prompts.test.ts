import { buildStagePrompt, buildStagePromptString, PromptContext, PromptBlocks, BuildStagePromptOptions, buildInnerWorkPrompt, InsightContext } from '../stage-prompts';
import type { ContextBundle } from '../context-assembler';
import type { MemoryIntentResult } from '../memory-intent';

/** Join both blocks into a single string for content assertions */
const fullPrompt = (blocks: PromptBlocks) => `${blocks.staticBlock}\n\n${blocks.dynamicBlock}`;

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

  describe('buildStagePrompt returns PromptBlocks', () => {
    it('returns an object with staticBlock and dynamicBlock', () => {
      const context = createContext();
      const result = buildStagePrompt(1, context);

      expect(result).toHaveProperty('staticBlock');
      expect(result).toHaveProperty('dynamicBlock');
      expect(typeof result.staticBlock).toBe('string');
      expect(typeof result.dynamicBlock).toBe('string');
      expect(result.staticBlock.length).toBeGreaterThan(0);
      expect(result.dynamicBlock.length).toBeGreaterThan(0);
    });

    it('static block does NOT contain dynamic values (turnCount, intensity numbers)', () => {
      const context = createContext({ turnCount: 7, emotionalIntensity: 6 });
      const result = buildStagePrompt(1, context);

      // Static block should not contain turn-specific values
      expect(result.staticBlock).not.toMatch(/Turn: \d+/);
      expect(result.staticBlock).not.toMatch(/intensity: \d+\/10/i);
    });

    it('dynamic block contains per-turn values', () => {
      const context = createContext({ turnCount: 7, emotionalIntensity: 6 });
      const result = buildStagePrompt(1, context);

      expect(result.dynamicBlock).toContain('Turn: 7');
      expect(result.dynamicBlock).toContain('6/10');
    });

    it('static block is identical across turns for the same stage', () => {
      const context1 = createContext({ turnCount: 1, emotionalIntensity: 3 });
      const context2 = createContext({ turnCount: 5, emotionalIntensity: 7 });

      const result1 = buildStagePrompt(1, context1);
      const result2 = buildStagePrompt(1, context2);

      expect(result1.staticBlock).toBe(result2.staticBlock);
    });

    it('dynamic blocks differ across turns', () => {
      const context1 = createContext({ turnCount: 1, emotionalIntensity: 3 });
      const context2 = createContext({ turnCount: 5, emotionalIntensity: 7 });

      const result1 = buildStagePrompt(1, context1);
      const result2 = buildStagePrompt(1, context2);

      expect(result1.dynamicBlock).not.toBe(result2.dynamicBlock);
    });
  });

  describe('buildStagePromptString', () => {
    it('joins both blocks into a single string', () => {
      const context = createContext();
      const blocks = buildStagePrompt(1, context);
      const combined = buildStagePromptString(1, context);

      expect(combined).toContain(blocks.staticBlock);
      expect(combined).toContain(blocks.dynamicBlock);
    });
  });

  describe('buildStagePrompt content', () => {
    it('returns Stage 1 prompt for stage 1', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('listen to Test User');
      expect(prompt).toContain('Test User');
    });

    it('returns Stage 2 prompt for stage 2', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(2, context));

      expect(prompt).toContain('exploring what Partner might be going through');
      expect(prompt).toContain('Partner');
    });

    it('returns Stage 3 prompt for stage 3', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(3, context));

      expect(prompt).toContain('Need Mapping');
      expect(prompt).toContain('needs underneath');
    });

    it('returns Stage 4 prompt for stage 4', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('Strategic Repair');
      expect(prompt).toContain('experiment');
    });

    it('returns invitation prompt for stage 0 with isInvitationPhase', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      expect(prompt).toContain('invitation');
      expect(prompt).toContain('Partner');
    });
  });

  describe('Stage Transition Prompts', () => {
    it('returns transition injection + regular Stage 1 prompt for Stage 0 → Stage 1', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 0,
      };
      const prompt = fullPrompt(buildStagePrompt(1, context, options));

      // Should contain transition injection
      expect(prompt).toContain('TRANSITION:');
      expect(prompt).toContain('just sent their invitation');
      expect(prompt).toContain('Partner');
      // Should also contain the regular Stage 1 prompt (not replaced)
      expect(prompt).toContain('listen to Test User');
      // Should NOT explicitly name stages
      expect(prompt).not.toContain('"Stage 1"');
      expect(prompt).not.toContain('"witness stage"');
    });

    it('transition injection goes in dynamic block, not static', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 0,
      };
      const result = buildStagePrompt(1, context, options);

      // Transition injection should be in dynamic block
      expect(result.dynamicBlock).toContain('TRANSITION:');
      // Static block should NOT change for transitions
      expect(result.staticBlock).not.toContain('TRANSITION:');
    });

    it('returns transition injection + regular Stage 2 prompt for Stage 1 → Stage 2', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 1,
      };
      const prompt = fullPrompt(buildStagePrompt(2, context, options));

      // Transition injection content
      expect(prompt).toContain('TRANSITION:');
      expect(prompt).toContain('feeling heard');
      expect(prompt).toContain('Partner');
      // Regular Stage 2 prompt content
      expect(prompt).toContain('exploring what Partner might be going through');
      expect(prompt).toContain('FOUR MODES');
    });

    it('returns transition injection + regular Stage 3 prompt for Stage 2 → Stage 3', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 2,
      };
      const prompt = fullPrompt(buildStagePrompt(3, context, options));

      // Transition injection content
      expect(prompt).toContain('TRANSITION:');
      expect(prompt).toContain('empathy');
      expect(prompt).toContain('need');
      expect(prompt).toContain('Partner');
      // Regular Stage 3 prompt content
      expect(prompt).toContain('Need Mapping');
      expect(prompt).toContain('underlying needs');
    });

    it('returns transition injection + regular Stage 4 prompt for Stage 3 → Stage 4', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 3,
      };
      const prompt = fullPrompt(buildStagePrompt(4, context, options));

      // Transition injection content
      expect(prompt).toContain('TRANSITION:');
      expect(prompt).toContain('needs');
      // Regular Stage 4 prompt content
      expect(prompt).toContain('Strategic Repair');
      expect(prompt).toContain('experiment');
      expect(prompt).toContain('Partner');
    });

    it('returns regular prompt without injection for unrecognized transition', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 4, // No 4→1 transition exists
      };
      const prompt = fullPrompt(buildStagePrompt(1, context, options));

      // Should be regular Stage 1 prompt without transition injection
      expect(prompt).not.toContain('TRANSITION:');
      expect(prompt).toContain('listen to Test User');
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
      const prompt = fullPrompt(buildStagePrompt(1, context, options));

      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Bob');
    });

    it('transition prompts include micro-tag format from regular stage prompt', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 0,
      };
      const prompt = fullPrompt(buildStagePrompt(1, context, options));

      // The regular stage prompt includes micro-tag format via buildResponseProtocol
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
        const prompt = fullPrompt(buildStagePrompt(toStage, context, options));

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
      const prompt = fullPrompt(buildStagePrompt(1, context, options));

      // Should be regular listening prompt, not transition
      expect(prompt).toContain('listen to Test User');
      expect(prompt).toContain('PERSPECTIVE AWARENESS');
    });

    it('uses regular Stage 2 prompt when not transitioning', () => {
      const context = createContext({ turnCount: 5 });
      const options: BuildStagePromptOptions = {
        isStageTransition: false,
      };
      const prompt = fullPrompt(buildStagePrompt(2, context, options));

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
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('<thinking>');
      // The flag instruction is in format "FeelHeardCheck: [Y if ready..., N otherwise]"
      expect(prompt).toContain('FeelHeardCheck:');
      expect(prompt).toMatch(/FeelHeardCheck.*Y.*N/s);
    });

    it('Stage 2 protocol includes ReadyShare flag instruction', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(2, context));

      expect(prompt).toContain('<thinking>');
      // The flag instruction is in format "ReadyShare: [Y if ready..., N otherwise]"
      expect(prompt).toContain('ReadyShare:');
      expect(prompt).toMatch(/ReadyShare.*Y.*N/s);
    });

    it('Stage 0 protocol includes draft tag instruction', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      expect(prompt).toContain('<draft>');
    });

    it('protocol includes dispatch tag instruction', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('<dispatch>');
      expect(prompt).toContain('EXPLAIN_PROCESS');
    });

    it('does NOT include old tool call instructions', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(1, context));

      // Should not have tool call instructions
      expect(prompt).not.toContain('update_session_state');
      expect(prompt).not.toContain('THIRD: Call');
    });
  });

  describe('Stage 2B (Informed Empathy) Prompt', () => {
    it('returns PromptBlocks with staticBlock and dynamicBlock', () => {
      const context = createContext();
      const result = buildStagePrompt(21, context);

      expect(result).toHaveProperty('staticBlock');
      expect(result).toHaveProperty('dynamicBlock');
      expect(result.staticBlock.length).toBeGreaterThan(0);
      expect(result.dynamicBlock.length).toBeGreaterThan(0);
    });

    it('static block mentions refining empathy with new information', () => {
      const context = createContext();
      const result = buildStagePrompt(21, context);

      expect(result.staticBlock).toContain('refining');
      expect(result.staticBlock).toContain('new information');
      expect(result.staticBlock).toContain('Test User');
      expect(result.staticBlock).toContain('Partner');
    });

    it('static block includes three modes: INTEGRATING, STRUGGLING, CLARIFYING', () => {
      const context = createContext();
      const result = buildStagePrompt(21, context);

      expect(result.staticBlock).toContain('INTEGRATING');
      expect(result.staticBlock).toContain('STRUGGLING');
      expect(result.staticBlock).toContain('CLARIFYING');
    });

    it('static block includes ReadyShare flag and draft tags', () => {
      const context = createContext();
      const result = buildStagePrompt(21, context);

      expect(result.staticBlock).toContain('ReadyShare:Y');
      expect(result.staticBlock).toContain('<draft>');
    });

    it('dynamic block includes gap context when provided', () => {
      const context = createContext({
        reconcilerGapContext: {
          missedFeelings: ['frustration', 'disappointment'],
          gapSummary: 'Partner felt unheard about their work concerns',
          mostImportantGap: 'The depth of feeling about being undervalued',
          iteration: 1,
        },
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('Partner felt unheard');
      expect(result.dynamicBlock).toContain('frustration');
      expect(result.dynamicBlock).toContain('disappointment');
      expect(result.dynamicBlock).toContain('depth of feeling about being undervalued');
    });

    it('dynamic block includes iteration notice for attempt > 1', () => {
      const context = createContext({
        reconcilerGapContext: {
          missedFeelings: [],
          gapSummary: 'Some gaps remain',
          mostImportantGap: null,
          iteration: 2,
        },
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('refinement attempt 2');
    });

    it('dynamic block does NOT include iteration notice for first attempt', () => {
      const context = createContext({
        reconcilerGapContext: {
          missedFeelings: [],
          gapSummary: 'Some gaps',
          mostImportantGap: null,
          iteration: 1,
        },
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).not.toContain('refinement attempt');
    });

    it('dynamic block includes shared context from partner', () => {
      const context = createContext({
        sharedContextFromPartner: 'I felt really hurt when you dismissed my concerns about the project deadline.',
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('dismissed my concerns about the project deadline');
      expect(result.dynamicBlock).toContain('PARTNER');
    });

    it('dynamic block includes previous empathy content', () => {
      const context = createContext({
        previousEmpathyContent: 'I think Partner feels stressed about their workload.',
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('stressed about their workload');
      expect(result.dynamicBlock).toContain('PREVIOUS EMPATHY ATTEMPT');
    });

    it('dynamic block includes current empathy draft', () => {
      const context = createContext({
        empathyDraft: 'Partner seems to feel overwhelmed and undervalued at work.',
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('overwhelmed and undervalued');
      expect(result.dynamicBlock).toContain('WORKING DRAFT');
    });

    it('static block is identical across turns', () => {
      const context1 = createContext({ turnCount: 1, emotionalIntensity: 3 });
      const context2 = createContext({ turnCount: 5, emotionalIntensity: 7 });

      const result1 = buildStagePrompt(21, context1);
      const result2 = buildStagePrompt(21, context2);

      expect(result1.staticBlock).toBe(result2.staticBlock);
    });

    it('dynamic blocks differ across turns', () => {
      const context1 = createContext({ turnCount: 1, emotionalIntensity: 3 });
      const context2 = createContext({ turnCount: 5, emotionalIntensity: 7 });

      const result1 = buildStagePrompt(21, context1);
      const result2 = buildStagePrompt(21, context2);

      expect(result1.dynamicBlock).not.toBe(result2.dynamicBlock);
    });

    it('uses Stage 2 response protocol (ReadyShare, not FeelHeardCheck)', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(21, context));

      expect(prompt).toContain('ReadyShare:');
      expect(prompt).not.toContain('FeelHeardCheck:');
    });
  });
});
