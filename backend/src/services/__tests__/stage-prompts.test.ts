import { buildStagePrompt, buildStagePromptString, buildInitialMessagePrompt, PromptContext, PromptBlocks, BuildStagePromptOptions, buildInnerWorkPrompt, InsightContext } from '../stage-prompts';
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
      timeSinceLastUserTurnMs: null,
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

      expect(prompt).toContain('What Matters');
      expect(prompt).toContain('what truly matters');
    });

    it('Stage 3 prompt includes CONFIRMING mode', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(3, context));

      expect(prompt).toContain('CONFIRMING');
      expect(prompt).toContain('summary');
      expect(prompt).toContain('FOUR MODES');
    });

    it('Stage 3 prompt includes post-reveal phase guidance only when needsShared gate is satisfied', () => {
      // Without needsShared gate — POST-REVEAL should NOT appear
      const context = createContext();
      const promptWithout = fullPrompt(buildStagePrompt(3, context));
      expect(promptWithout).not.toContain('POST-REVEAL PHASES');

      // With needsShared gate — POST-REVEAL should appear
      const contextWithGate = createContext({
        contextBundle: {
          ...mockContextBundle,
          stageContext: { stage: 3, gatesSatisfied: { needsShared: true } },
        },
      });
      const promptWith = fullPrompt(buildStagePrompt(3, contextWithGate));
      expect(promptWith).toContain('POST-REVEAL PHASES');
      expect(promptWith).toContain('NOTICING');
      expect(promptWith).toContain('FOLLOWING UP');
      expect(promptWith).toContain('EMOTIONAL PROCESSING');
      expect(promptWith).toContain('VALIDITY');
    });

    it('Stage 3 FORBIDDEN list prevents identifying overlap between needs lists', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(3, context));

      expect(prompt).toContain('common ground');
      expect(prompt).toContain('overlap');
      expect(prompt).toContain('That insight belongs to the users');
    });

    it('Stage 3 prompt does not contain hardcoded user-facing opening phrase', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(3, context));

      // The old hardcoded opening should be gone
      expect(prompt).not.toContain('When you step back and look at all of this');
    });

    it('Stage 3 prompt preserves existing REDIRECTING, SUGGESTING, DEEPENING modes', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(3, context));

      expect(prompt).toContain('REDIRECTING');
      expect(prompt).toContain('SUGGESTING');
      expect(prompt).toContain('DEEPENING');
    });

    it('returns Stage 4 prompt for stage 4', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('Strategic Repair');
      expect(prompt).toContain('experiment');
    });

    it('returns topic-articulation prompt for stage 0 with isInvitationPhase', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      // Stage 0 is now about articulating the topic, not drafting an invitation
      expect(prompt).toContain('topic');
      expect(prompt).toContain('Partner');
    });

    it('stage 0 prompt instructs the AI to emit a topic via <draft> tags', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      // Stage 0 emits the TOPIC (not an invitation message) inline as <draft>
      expect(prompt).toContain('<draft>');
      // Must never bring back the invitation-message concept
      expect(prompt).not.toContain('invitationMessage');
    });

    it('stage 0 prompt documents the <draft> protocol constraints (≤ 20 words, neutral)', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      expect(prompt).toMatch(/20 words/);
      expect(prompt.toLowerCase()).toContain('neutral');
      expect(prompt.toLowerCase()).toContain('blame');
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
      expect(prompt).toContain('just finalized the invitation message');
      expect(prompt).toContain("we don't actually know whether they shared it yet");
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
      expect(prompt).toContain('what matters');
      expect(prompt).toContain('Partner');
      expect(prompt).toContain('PRIVATELY');
      // Regular Stage 3 prompt content
      expect(prompt).toContain('What Matters');
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

  describe('buildInnerWorkPrompt', () => {
    it('returns PromptBlocks with static and dynamic content', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
        emotionalIntensity: 5,
      });

      expect(result).toHaveProperty('staticBlock');
      expect(result).toHaveProperty('dynamicBlock');
    });

    it('static block contains voice/style guidance', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
      });

      expect(result.staticBlock).toContain('VOICE & STYLE');
      expect(result.staticBlock).toContain('Say it like you\'d say it to a friend');
      expect(result.staticBlock).toContain('1-3 sentences by default');
    });

    it('static block contains response format with JSON instructions', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
      });

      expect(result.staticBlock).toContain('"response"');
      expect(result.staticBlock).toContain('"suggestedActions"');
      expect(result.staticBlock).toContain('<thinking>');
    });

    it('static block does not contain clinical language patterns', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
      });

      expect(result.staticBlock).not.toContain('"It sounds like..."');
      expect(result.staticBlock).not.toContain('"I\'m hearing..."');
      expect(result.staticBlock).not.toContain('BEFORE EVERY RESPONSE');
    });

    it('static block does not contain old response protocol dispatch tags', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
      });

      expect(result.staticBlock).not.toContain('<dispatch>');
      expect(result.staticBlock).not.toContain('EXPLAIN_PROCESS');
    });

    it('dynamic block contains turn-specific content', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 7,
        emotionalIntensity: 6,
        sessionSummary: 'Processing work stress',
        recentThemes: ['anxiety', 'boundaries'],
      });

      expect(result.dynamicBlock).toContain('Turn number: 7');
      expect(result.dynamicBlock).toContain('6/10');
      expect(result.dynamicBlock).toContain('Processing work stress');
      expect(result.dynamicBlock).toContain('anxiety');
      expect(result.dynamicBlock).toContain('boundaries');
    });

    it('dynamic block shows OPENING MODE for early sessions', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 1,
      });

      expect(result.dynamicBlock).toContain('OPENING MODE');
    });

    it('dynamic block shows EXPLORATION MODE for later sessions', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
      });

      expect(result.dynamicBlock).toContain('EXPLORATION MODE');
    });

    it('dynamic block includes high intensity guidance when intensity >= 8', () => {
      const result = buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
        emotionalIntensity: 9,
      });

      expect(result.dynamicBlock).toContain('Emotional intensity is high');
      expect(result.dynamicBlock).toContain('Validate heavily');
    });

    it('includes insights in dynamic block when provided', () => {
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

      const prompt = fullPrompt(buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
        insights,
      }));

      expect(prompt).toContain('CROSS-FEATURE INSIGHTS');
      expect(prompt).toContain('Pattern noticed: You frequently mention work stress');
      expect(prompt).toContain('Suggestion: Consider trying a short meditation');
      expect(prompt).toContain('85%');
      expect(prompt).toContain('Weave observations naturally');
    });

    it('does not include insights section when no insights provided', () => {
      const prompt = fullPrompt(buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
        insights: [],
      }));

      expect(prompt).not.toContain('CROSS-FEATURE INSIGHTS');
    });

    it('does not include insights section when insights is undefined', () => {
      const prompt = fullPrompt(buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 5,
      }));

      expect(prompt).not.toContain('CROSS-FEATURE INSIGHTS');
    });

    it('formats CONTRADICTION insights with appropriate label', () => {
      const insights: InsightContext[] = [
        {
          type: 'CONTRADICTION',
          summary: 'You say trust is important but mentioned avoiding vulnerability',
        },
      ];

      const prompt = fullPrompt(buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 3,
        insights,
      }));

      expect(prompt).toContain('Something to explore: You say trust is important');
    });

    it('includes guidance on natural integration of insights', () => {
      const insights: InsightContext[] = [
        {
          type: 'PATTERN',
          summary: 'Test pattern',
        },
      ];

      const prompt = fullPrompt(buildInnerWorkPrompt({
        userName: 'Test User',
        turnCount: 3,
        insights,
      }));

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

    it('Stage 0 protocol instructs the AI to emit a topic via <draft> tags', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      // Stage 0 now emits the proposed TOPIC inline as <draft> (not an invitation message).
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

    it('dynamic block includes abstract guidance when provided (no raw partner content)', () => {
      const context = createContext({
        reconcilerGapContext: {
          areaHint: 'work and effort',
          guidanceType: 'explore_deeper_feelings',
          promptSeed: 'what might be underneath the surface',
          iteration: 1,
        },
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('work and effort');
      expect(result.dynamicBlock).toContain('underneath the surface');
      // Must NOT contain raw partner feelings or gap details
      expect(result.dynamicBlock).not.toContain('missedFeelings');
      expect(result.dynamicBlock).not.toContain('gapSummary');
    });

    it('dynamic block includes challenge_assumptions guidance type', () => {
      const context = createContext({
        reconcilerGapContext: {
          areaHint: 'safety and security',
          guidanceType: 'challenge_assumptions',
          promptSeed: 'what might be different from your initial understanding',
          iteration: 1,
        },
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('reconsider some of their initial assumptions');
    });

    it('dynamic block includes iteration notice for attempt > 1', () => {
      const context = createContext({
        reconcilerGapContext: {
          areaHint: null,
          guidanceType: null,
          promptSeed: null,
          iteration: 2,
        },
      });
      const result = buildStagePrompt(21, context);

      expect(result.dynamicBlock).toContain('refinement attempt 2');
    });

    it('dynamic block does NOT include iteration notice for first attempt', () => {
      const context = createContext({
        reconcilerGapContext: {
          areaHint: null,
          guidanceType: null,
          promptSeed: null,
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

  describe('surface option', () => {
    it('defaults to mobile — no Slack formatting rules in the static block', () => {
      const blocks = buildStagePrompt(1, createContext());
      expect(blocks.staticBlock).not.toContain('SLACK FORMATTING');
    });

    it('explicit surface: "mobile" also omits Slack formatting rules', () => {
      const blocks = buildStagePrompt(1, createContext(), { surface: 'mobile' });
      expect(blocks.staticBlock).not.toContain('SLACK FORMATTING');
    });

    it('surface: "slack" appends mrkdwn rules to the static block', () => {
      const blocks = buildStagePrompt(1, createContext(), { surface: 'slack' });
      expect(blocks.staticBlock).toContain('SLACK FORMATTING');
      expect(blocks.staticBlock).toContain('mrkdwn');
      expect(blocks.staticBlock).toContain('*single asterisks*');
      expect(blocks.staticBlock).toContain('_underscores_');
    });

    it('surface: "slack" keeps the same dynamic block as mobile (parity)', () => {
      const ctx = createContext({ turnCount: 5, emotionalIntensity: 6 });
      const mobile = buildStagePrompt(1, ctx);
      const slack = buildStagePrompt(1, ctx, { surface: 'slack' });
      expect(slack.dynamicBlock).toBe(mobile.dynamicBlock);
    });

    it('surface: "slack" preserves the micro-tag response protocol', () => {
      const blocks = buildStagePrompt(1, createContext(), { surface: 'slack' });
      // The response protocol lives in the static block, so it must still be
      // there alongside the Slack rules.
      expect(blocks.staticBlock).toContain('<thinking>');
      expect(blocks.staticBlock).toContain('FeelHeardCheck');
    });

    it('surface: "slack" works on every stage', () => {
      for (const stage of [0, 1, 2, 3, 4, 21]) {
        const blocks = buildStagePrompt(stage, createContext(), { surface: 'slack' });
        expect(blocks.staticBlock).toContain('SLACK FORMATTING');
      }
    });
  });

  describe('invitedSessionNudge injection', () => {
    it('is absent by default', () => {
      const blocks = buildStagePrompt(0, createContext(), { surface: 'slack' });
      expect(blocks.dynamicBlock).not.toContain('OPERATIONAL NUDGE');
    });

    it('is appended to the dynamic block when present', () => {
      const blocks = buildStagePrompt(
        0,
        createContext({
          invitedSessionNudge: 'Session waiting 5 days. Re-share code `abc123`.',
        }),
        { surface: 'slack' }
      );
      expect(blocks.dynamicBlock).toContain('OPERATIONAL NUDGE:');
      expect(blocks.dynamicBlock).toContain('abc123');
    });

    it('is NOT baked into the cached static block (still per-turn)', () => {
      const blocks = buildStagePrompt(
        0,
        createContext({
          invitedSessionNudge: 'anything',
        }),
        { surface: 'slack' }
      );
      expect(blocks.staticBlock).not.toContain('OPERATIONAL NUDGE');
    });

    it('does not fire when invitedSessionNudge is explicitly null', () => {
      const blocks = buildStagePrompt(
        0,
        createContext({ invitedSessionNudge: null }),
        { surface: 'slack' }
      );
      expect(blocks.dynamicBlock).not.toContain('OPERATIONAL NUDGE');
    });
  });

  describe('buildInitialMessagePrompt — Stage 0 opening', () => {
    it('Stage 0 invitation-phase opener references the partner name and topic-not-details framing', () => {
      const prompt = buildInitialMessagePrompt(
        0,
        { userName: 'Alice', partnerName: 'Bob' },
        true
      );

      expect(prompt).toContain('Bob');
      expect(prompt).toContain('topic');
      expect(prompt.toLowerCase()).toContain('not the details');
      // Must not bring back the invitation-message concept
      expect(prompt).not.toContain('invitationMessage');
    });

    it('falls back to "your partner" when no partner name is provided', () => {
      const prompt = buildInitialMessagePrompt(
        0,
        { userName: 'Alice' },
        true
      );

      expect(prompt).toContain('your partner');
    });

    it('invitee opener continues after the topic card instead of greeting again', () => {
      const prompt = buildInitialMessagePrompt(
        1,
        {
          userName: 'Jason',
          partnerName: 'Shantam',
          isInvitee: true,
          topicFrame: 'Giving each other heads up before stopping by',
        },
        false
      );

      expect(prompt).toContain('TOPIC ALREADY SHOWN ABOVE THIS MESSAGE');
      expect(prompt).toContain('Giving each other heads up before stopping by');
      expect(prompt).toContain('Does NOT greet them by name');
      expect(prompt).toContain('Does NOT say "thanks for accepting"');
      expect(prompt).not.toContain('Hey Jason, thanks for accepting');
    });
  });
});
