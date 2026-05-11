import { buildStagePrompt, buildStagePromptString, buildInitialMessagePrompt, PromptContext, PromptBlocks, BuildStagePromptOptions, buildInnerWorkPrompt, InsightContext, buildReconcilerPrompt, buildReconcilerEvidencePacket } from '../stage-prompts';
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

    it('asks all stages to proofread visible response text', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('proofread contractions, spaces, and quotation marks');
      expect(prompt).toContain('stray unmatched quotes');
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

    it('Stage 3 prompt slows down compressed high-stakes needs before capture', () => {
      const context = createContext({ userName: 'Catherine', partnerName: 'James' });
      const prompt = fullPrompt(buildStagePrompt(3, context));

      expect(prompt).toContain('COMPRESSED-NEEDS PACING');
      expect(prompt).toContain('one dense answer that stacks multiple real needs');
      expect(prompt).toContain('safety/accountability/autonomy/self-trust');
      expect(prompt).toContain('care/belonging/recognition/heard');
      expect(prompt).toContain('before NeedsReady:Y');
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
      expect(prompt).toContain('proposal inventory');
    });

    it('Stage 4 prompt supports collaborative proposal inventory without ranking pressure', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('proposal inventory');
      expect(prompt).toContain('Stage 3 needs');
      expect(prompt).toContain('shared proposal');
      expect(prompt).toContain('individual commitment');
      expect(prompt).toContain('Do not force ranking');
      expect(prompt).toContain('Willingness from one person is not a shared agreement');
    });

    it('Stage 4 prompt forbids speculative partner placeholders', () => {
      const context = createContext({ userName: 'Adam', partnerName: 'Eve' });
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain("Do not ask Adam to compare against Eve's experiments");
      expect(prompt).toContain('unless the current visible/app context includes actual partner proposals');
      expect(prompt).toContain('Never output placeholders');
      expect(prompt).toContain('[these would appear here]');
    });

    it('Stage 4 prompt covers declined AI ideas and removals', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('Ask before contributing AI ideas');
      expect(prompt).toContain('If Test User declines AI ideas, accept that');
      expect(prompt).toContain('Never re-suggest removed items');
      expect(prompt).toContain('honor it immediately');
      expect(prompt).toContain('instead of guessing which proposal they meant');
    });

    it('Stage 4 prompt treats individual-only and no-overlap closure as valid outcomes', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('no-shared-agreement as a valid outcome');
      expect(prompt).toContain('Do not describe no-overlap or no-shared-agreement as failure');
      expect(prompt).toContain('individual commitments can still be carried forward');
      expect(prompt).toContain('Do not ask for scheduled shared check-in timing for individual-only commitments');
    });

    it('Stage 4 prompt gives both partners a no-shared-agreement closure path', () => {
      const context = createContext({ userName: 'Catherine', partnerName: 'James' });
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('shared proposal inventory');
      expect(prompt).toContain('individual commitment(s) being preserved');
      expect(prompt).toContain('needs that remain open');
      expect(prompt).toContain('Give both partners a dignified path');
      expect(prompt).toContain('boundary or individual commitment is still a legitimate outcome');
    });

    it('Stage 4 no-shared-agreement prompt avoids failure-language tokens', () => {
      const context = createContext({
        turnCount: 3,
        contextBundle: {
          ...mockContextBundle,
          stageContext: {
            stage: 4,
            gatesSatisfied: {
              selectionSubmitted: true,
              partnerSelectionSubmitted: true,
              noSharedAgreement: true,
            },
          },
        },
      });
      const prompt = fullPrompt(buildStagePrompt(4, context)).toLowerCase();

      expect(prompt).not.toContain('failed');
      expect(prompt).not.toContain('unsuccessful');
      expect(prompt).not.toContain('incomplete');
      expect(prompt).not.toContain("didn't reach");
      expect(prompt).not.toContain("couldn't");
    });

    it('Stage 4 individual-only commitments do not trigger follow-up mandate language', () => {
      const context = createContext({
        contextBundle: {
          ...mockContextBundle,
          stageContext: {
            stage: 4,
            gatesSatisfied: {
              individualCommitmentOnly: true,
            },
          },
        },
      });
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).not.toMatch(/follow-up check-in\s*\(required\)/i);
      expect(prompt).not.toMatch(/every (experiment|proposal|strategy) must include/i);
      expect(prompt).not.toMatch(/not optional/i);
      expect(prompt).not.toMatch(/without a follow-up is incomplete/i);
      expect(prompt).toContain('Do not ask for scheduled shared check-in timing for individual-only commitments');
    });

    it('Stage 4 prompt avoids grading praise tokens', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context)).toLowerCase();

      expect(prompt).not.toContain('solid experiment');
      expect(prompt).not.toContain('good idea');
      expect(prompt).not.toContain("that's a great");
      expect(prompt).not.toContain('great idea');
      expect(prompt).not.toContain('good vs bad');
    });

    it('Stage 4 response protocol keeps ProposedStrategy as compatibility fallback only', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('compatibility fallback');
      expect(prompt).toContain('user clearly volunteered, accepted, or committed');
      expect(prompt).toContain('Do NOT list AI ideas the user has not accepted');
      expect(prompt).toContain('desired-outcome fragments');
      expect(prompt).toContain('walk away knowing');
      expect(prompt).toContain('Do NOT write generic labels such as "User will..."');
      expect(prompt).toContain('<stage4_proposals>');
      expect(prompt).toContain('"action": "ADD|REVISE|REMOVE|IGNORE"');
      expect(prompt).toContain('"classification": "PROPOSAL|REFLECTION|SUCCESS_MARKER|PROCESS"');
      expect(prompt).toContain('Emit this block on every Stage 4 turn');
      expect(prompt).toContain('Only action ADD with classification PROPOSAL creates a proposal card');
      expect(prompt).toContain('guarded consent to continue talking');
      expect(prompt).toContain('I can talk about next steps');
      expect(prompt).toContain('one person');
      expect(prompt).toContain('as if it were a shared agreement');
    });

    it('Stage 4 prompt treats success markers as not proposals yet', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('Not a proposal yet');
      expect(prompt).toContain('Reflect it as a success criterion');
      expect(prompt).toContain('what concrete action would produce that outcome');
    });

    it('Stage 4 prompt includes structured capture ids for typed ownership', () => {
      const context = createContext({
        currentUserId: 'user-current',
        partnerUserId: 'user-partner',
      });
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('currentUserId: user-current');
      expect(prompt).toContain('partnerUserId: user-partner');
      expect(prompt).toContain('ownerUserId to currentUserId for INDIVIDUAL_COMMITMENT');
    });

    it('Stage 4 prompt includes proposal ids for typed revisions', () => {
      const context = createContext({
        currentUserId: 'user-current',
        stage4InventoryContext:
          '- id=proposal-1 | kind=SHARED_PROPOSAL | owner=current user | description="weekly check-in"',
      });
      const prompt = fullPrompt(buildStagePrompt(4, context));

      expect(prompt).toContain('CURRENT STAGE 4 PROPOSAL INVENTORY');
      expect(prompt).toContain('id=proposal-1');
      expect(prompt).toContain('emit action REVISE with targetProposalId instead of ADD');
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

    it('stage 0 topic framing preserves concrete behavioral signals while staying neutral', () => {
      const context = createContext({ userName: 'Catherine', partnerName: 'James' });
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      expect(prompt).toContain('Preserve the user\'s concrete behavioral signal');
      expect(prompt).toContain('yelling');
      expect(prompt).toContain('personal attacks');
      expect(prompt).toContain('Do not flatten');
      expect(prompt).toContain('vague phrases like "conflict"');
      expect(prompt).toContain('<draft>\ntopic text\n</draft>');
    });

    it('stage 0 preserves child and bathroom specificity for property-boundary topics', () => {
      const context = createContext({
        userName: 'Darryl',
        partnerName: 'Shantam',
        contextBundle: {
          ...mockContextBundle,
          conversationContext: {
            ...mockContextBundle.conversationContext,
            recentTurns: [
              {
                role: 'user',
                content: 'There is human waste in my yard and I think it is connected to his child having bathroom issues. I want it stopped.',
              },
            ] as any,
          },
        },
      });
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      expect(prompt).toContain('child/bathroom-boundary detail');
      expect(prompt).toContain('Topic specificity signal');
      expect(prompt).toContain('Do not reduce it to only "human waste in the yard."');
    });

    it('stage 0 drafts once the user names a concrete issue and desired boundary', () => {
      const context = createContext({
        userName: 'Darryl',
        partnerName: 'Shantam',
        contextBundle: {
          ...mockContextBundle,
          conversationContext: {
            ...mockContextBundle.conversationContext,
            recentTurns: [
              {
                role: 'user',
                content: 'There is human waste showing up in my yard. I think it is connected to Shantam and I want it stopped.',
              },
            ] as any,
          },
        },
      });
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      expect(prompt).toContain('If the user has already named the concrete issue and what they want addressed, draft immediately');
      expect(prompt).toContain('Topic sufficiency signal');
      expect(prompt).toContain('do not ask for frequency, proof, timeline, motive, or extra details');
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

    it('Stage 1 → Stage 2 transition preserves non-agreement and avoids research framing', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = {
        isStageTransition: true,
        previousStage: 1,
      };
      const prompt = fullPrompt(buildStagePrompt(2, context, options));

      expect(prompt).toContain('not about excusing, agreeing, softening boundaries, promising repair, or deciding what happens next');
      expect(prompt).toContain('without selling repair or agreement');
      expect(prompt).toContain('do not praise them with "brave", "courage", "real honesty", "took real effort"');
      expect(prompt).toContain('what you just did really mattered');
      expect(prompt).toContain('Do not start with "Thank you for..."');
      expect(prompt).toContain('Avoid clinical phrases like "protected attempt"');
      expect(prompt).not.toContain('research');
      expect(prompt).not.toContain('working things out');
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

    it('Stage 1 prompt requires deeper gating for long-running high-conflict patterns', () => {
      const context = createContext({ turnCount: 6, emotionalIntensity: 7 });
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('HIGH-CONFLICT / LONG-RUNNING CASES');
      expect(prompt).toContain('Do not offer the felt-heard gate after only naming the pattern');
      expect(prompt).toContain('high-resistance/non-resolution case');
      expect(prompt).toContain('do not set FeelHeardCheck:Y before at least five substantive user turns');
      expect(prompt).toContain('does not count as the user\'s answer to that check');
      expect(prompt).toContain('what they have already tried');
      expect(prompt).toContain('care underneath resentment');
      expect(prompt).toContain('maybe I need to know I really tried');
      expect(prompt).toContain('make one final open-floor move');
      expect(prompt).toContain('understanding the other person is not the same as excusing impact');
    });

    it('Stage 1 prompt separates felt-heard gating from partner-share readiness', () => {
      const context = createContext({ turnCount: 7, emotionalIntensity: 6 });
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('FELT-HEARD GATE BOUNDARY');
      expect(prompt).toContain('Stage 1 is only about whether this user feels heard by you');
      expect(prompt).toContain('Do not ask whether they want their partner to hear something');
      expect(prompt).toContain('Do not ask what they hope would happen if they said it to their partner');
      expect(prompt).toContain('treat that as fresh material to witness');
      expect(prompt).toContain('Never convert that check into partner-share readiness');
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

    it('Stage 2 prompt guards against premature empathy drafts under resistance', () => {
      const context = createContext({ turnCount: 4, emotionalIntensity: 6 });
      const prompt = fullPrompt(buildStagePrompt(2, context));

      expect(prompt).toContain('Stage 2 is not a speed run to a draft');
      expect(prompt).toContain('usually needs at least 4 substantive Stage 2 turns');
      expect(prompt).toContain('unfairness, anger, fear, resentment');
      expect(prompt).toContain('Does that feel like your real attempt');
      expect(prompt).toContain('ReadyShare guard: EARLY');
    });

    it('Stage 1 prompt validates disputed concrete concerns without settling responsibility', () => {
      const prompt = fullPrompt(buildStagePrompt(1, createContext({ turnCount: 5 })));

      expect(prompt).toContain('DISPUTED FACTS AND RESPONSIBILITY');
      expect(prompt).toContain('validate the user\'s experience without settling facts you do not know');
      expect(prompt).toContain('responsibility, intent, or motive is not proven');
      expect(prompt).toContain('Do not turn a vague, confused, or defensive response into a settled motive');
      expect(prompt).toContain('investigate, stop the behavior, protect the boundary');
    });

    it('Stage 1 prompt does not adopt high-conflict blame frames as fact', () => {
      const prompt = fullPrompt(buildStagePrompt(1, createContext({ turnCount: 6 })));

      expect(prompt).toContain('CONTESTED CAUSAL STORIES');
      expect(prompt).toContain('Do not adopt that causal story as product truth');
      expect(prompt).toContain('Validate the felt bind without agreeing to the blame frame');
      expect(prompt).toContain('Avoid reflections that sound like verdicts');
      expect(prompt).toContain('one person feeling criticized does not make yelling safe');
      expect(prompt).toContain('one person naming volatility does not prove the other person never contributed');
    });

    it('Stage 2 prompt adapts after repeated low-knowledge or process-frustration answers', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 4 })));

      expect(prompt).toContain('not knowing private inner states is valid information');
      expect(prompt).toContain('If they say "I don\'t know" again');
      expect(prompt).toContain('pivot to observable impact, uncertainty, and a bounded sentence scaffold');
      expect(prompt).toContain('Do not ask a third rephrased inner-state question');
    });

    it('Stage 2 prompt allows early readiness for bounded observational empathy', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 4 })));

      expect(prompt).toContain('bounded low-knowledge empathy attempt');
      expect(prompt).toContain('more inference would be irresponsible guessing');
      expect(prompt).toContain('Concrete-conflict sufficiency');
      expect(prompt).toContain('two layers do not always require shame, pride, reputation');
      expect(prompt).toContain('you may adapt and draft instead of repeating the same inner-state prompt');
    });

    it('Stage 2 prompt keeps concrete boundary empathy from becoming premature repair', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 6 })));

      expect(prompt).toContain('CONCRETE BOUNDARY CONFLICTS');
      expect(prompt).toContain('UNDERSTANDING ONLY, NOT AGREEMENT');
      expect(prompt).toContain('empathy does not have to become repair language');
      expect(prompt).toContain('Do not steer the user toward "what does Partner need from you"');
      expect(prompt).toContain('Do not ask what Partner "needs from you"');
      expect(prompt).toContain('Those belong in later needs/strategy stages');
      expect(prompt).toContain('Do not draft softening phrases like "can we investigate this as a team"');
      expect(prompt).toContain('Understanding how something lands is not an apology');
      expect(prompt).toContain('Consent to understand is not reassurance, agreement, apology, or a promise to repair');
      expect(prompt).toContain('Avoid "as a team", "work together", "I will do those things"');
      expect(prompt).toContain('do not convert a tentative hypothesis into settled motive');
      expect(prompt).toContain('Avoid adding "you do not want to believe it"');
    });

    it('Stage 2 prompt slows down relational identity conflicts before drafting', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 6 })));

      expect(prompt).toContain('RELATIONAL / IDENTITY CONFLICTS');
      expect(prompt).toContain('do not use the concrete-boundary fast path');
      expect(prompt).toContain('mirror that burden before bridging');
      expect(prompt).toContain('Do not ask "if you had to guess" as the first move after resistance');
      expect(prompt).toContain('Before a draft, get at least one turn about what feels unfair or costly about empathizing');
      expect(prompt).toContain('Do not draft from a single quick recognition');
    });

    it('Stage 2 prompt slows down safety volatility conflicts before drafting', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 6 })));

      expect(prompt).toContain('SAFETY / VOLATILITY / DIAGNOSIS CONFLICTS');
      expect(prompt).toContain('Do not draft after a single acknowledgment');
      expect(prompt).toContain('That is only the doorway');
      expect(prompt).toContain('vigilance plus loneliness');
      expect(prompt).toContain('Do not let "I am not a monster" become the final empathy');
      expect(prompt).toContain('ask one more mechanism-to-inside question before drafting');
    });

    it('Stage 2 prompt keeps safety drafts inside-frame rather than diagnostic', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 6 })));

      expect(prompt).toContain('must help Partner feel understood from inside their own frame');
      expect(prompt).toContain('Avoid clinical/impact-heavy conclusions');
      expect(prompt).toContain('you collapse or attack');
      expect(prompt).toContain('foreground what Partner might feel');
      expect(prompt).toContain('If a draft would make Partner feel only accused or pathologized');
      expect(prompt).toContain('do not make the share read like a clinical assessment');
      expect(prompt).toContain('Convert it into inside-frame empathy');
      expect(prompt).toContain('you may feel erased');
      expect(prompt).toContain('the story you need about yourself');
      expect(prompt).toContain('you are brittle');
      expect(prompt).toContain('Prefer their inside-frame fear');
    });

    it('Stage 2 prompt reduces generic process praise for boundary conflicts', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 6 })));

      expect(prompt).toContain('PROCESS PRAISE');
      expect(prompt).toContain('Avoid generic praise such as "brave", "courage", "protected attempt"');
      expect(prompt).toContain('Prefer "That gives us enough to draft"');
    });

    it('Stage 2 dynamic prompt forces readiness after a bounded non-conceding attempt', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({
        turnCount: 4,
        contextBundle: {
          ...mockContextBundle,
          conversationContext: {
            ...mockContextBundle.conversationContext,
            recentTurns: [
              {
                role: 'user',
                content: 'Probably protecting the idea that his kid is not doing it. I get that. It still has to stop.',
              },
            ] as any,
          },
        },
      })));

      expect(prompt).toContain('ReadyShare signal');
      expect(prompt).toContain('Set ReadyShare:Y and draft from their words now');
      expect(prompt).toContain('Do not ask another feeling/need/layer question');
      expect(prompt).toContain('omit unchosen shame/bad-parent wording');
    });

    it('Stage 2 dynamic readiness catches low-knowledge careless plus boundary wording', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({
        turnCount: 4,
        contextBundle: {
          ...mockContextBundle,
          conversationContext: {
            ...mockContextBundle.conversationContext,
            recentTurns: [
              {
                role: 'user',
                content: 'Maybe he does not want to look careless. Or maybe he really does not know. I cannot tell. I can keep it factual, but I am not going to soften the main point.',
              },
            ] as any,
          },
        },
      })));

      expect(prompt).toContain('ReadyShare signal');
      expect(prompt).toContain('Do not ask another feeling/need/layer question');
    });

    it('Stage 2 dynamic readiness catches concrete sanitation responsibility without action commitments', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({
        turnCount: 3,
        contextBundle: {
          ...mockContextBundle,
          conversationContext: {
            ...mockContextBundle.conversationContext,
            recentTurns: [
              {
                role: 'user',
                content: 'If there really is waste there, I can see why he would be angry and disgusted. I still do not know that my kid caused it, but I can see that he wants the boundary treated as real.',
              },
            ] as any,
          },
        },
      })));

      expect(prompt).toContain('ReadyShare signal');
      expect(prompt).toContain('Set ReadyShare:Y and draft from their words now');
      expect(prompt).toContain('Do not ask another feeling/need/layer question');
      expect(prompt).toContain('Do not ask what Partner "needs from you"');
      expect(prompt).toContain('Those belong in later needs/strategy stages');
    });

    it('Stage 2 dynamic prompt holds relational resistance before bridging again', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({
        turnCount: 4,
        contextBundle: {
          ...mockContextBundle,
          conversationContext: {
            ...mockContextBundle.conversationContext,
            recentTurns: [
              {
                role: 'user',
                content: 'My first answer is that he is comfortable and does not want anything to disturb that. His fear gets protected, and my wanting a bigger life becomes the threat.',
              },
            ] as any,
          },
        },
      })));

      expect(prompt).toContain('Relational resistance signal');
      expect(prompt).toContain('keep ReadyShare:N');
      expect(prompt).toContain('Mirror what feels unfair, costly, or exhausting');
      expect(prompt).toContain('do not draft until the user has both named the burden of empathizing');
    });

    it('Stage 2 dynamic prompt holds high-conflict volatility before drafting', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({
        turnCount: 5,
        contextBundle: {
          ...mockContextBundle,
          conversationContext: {
            ...mockContextBundle.conversationContext,
            recentTurns: [
              {
                role: 'user',
                content: 'Probably tense all the time, like she is waiting for the next thing to happen. I still think we both contribute, but I get that not knowing what I will say when I am angry would wear on a person.',
              },
            ] as any,
          },
        },
      })));

      expect(prompt).toContain('High-conflict volatility signal');
      expect(prompt).toContain('keep ReadyShare:N');
      expect(prompt).toContain('Do not draft from one narrow acknowledgment');
      expect(prompt).toContain('vigilance, loneliness, loss of trust, self-doubt');
    });

    it('Stage 2 draft guidance keeps concrete low-knowledge empathy plain', () => {
      const prompt = fullPrompt(buildStagePrompt(2, createContext({ turnCount: 6 })));

      expect(prompt).toContain('For concrete low-knowledge conflicts, keep the draft bounded and plain');
      expect(prompt).toContain('Do not add polished therapeutic layers');
      expect(prompt).toContain('can we investigate this as a team');
      expect(prompt).toContain('unless Test User explicitly said them or they came from consented partner context');
      expect(prompt).toContain('prefer "this may feel accusatory"');
      expect(prompt).toContain('over shame labels such as "bad parent"');
    });

    it('Stage 2 prompt prevents empathy drafts from adding unearned reassurance', () => {
      const context = createContext({ turnCount: 6, emotionalIntensity: 6 });
      const prompt = fullPrompt(buildStagePrompt(2, context));

      expect(prompt).toContain("Preserve Test User's caveats and non-concessions");
      expect(prompt).toContain('Do not add direct reassurance');
      expect(prompt).toContain('you are enough');
      expect(prompt).toContain('they are not trying to reassure Partner');
      expect(prompt).toContain('must not settle unresolved fit');
    });

    it('Stage 2 refinement mode can update an existing draft without the early draft guard', () => {
      const context = createContext({
        turnCount: 2,
        empathyDraft: 'I think you feel unseen.',
        isRefiningEmpathy: true,
      });
      const prompt = fullPrompt(buildStagePrompt(2, context));

      expect(prompt).toContain('REFINEMENT MODE');
      expect(prompt).not.toContain('ReadyShare guard: EARLY');
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

  describe('buildReconcilerPrompt', () => {
    const reconcilerContext = {
      guesserName: 'Adam',
      subjectName: 'Eve',
      empathyStatement: 'I think you felt wrongly accused and scared.',
      witnessingContent: 'I felt scared, but I also denied yelling at first.',
      extractedThemes: ['scared', 'defensive'],
      subjectFacts: [
        { category: 'Conflict', fact: 'Eve later acknowledged yelling during the argument.' },
      ],
      recentSubjectTurns: [
        { role: 'assistant' as const, content: 'Did you actually yell?', stage: 2 },
        { role: 'user' as const, content: 'Yeah, I did.', stage: 2 },
      ],
    };

    it('keeps reconciler instructions in a cacheable static block without per-session evidence', () => {
      const result = buildReconcilerPrompt(reconcilerContext);

      expect(result).toHaveProperty('staticBlock');
      expect(result).toHaveProperty('dynamicBlock');
      expect(result.staticBlock).toContain('TRUTH HIERARCHY');
      expect(result.staticBlock).toContain('Stage 1 witnessing is the emotional anchor');
      expect(result.staticBlock).toContain('Recent Stage 2 subject messages are the freshest signal');
      expect(result.staticBlock).not.toContain('Adam');
      expect(result.staticBlock).not.toContain('Eve');
      expect(result.staticBlock).not.toContain('Yeah, I did.');
      expect(result.staticBlock).not.toContain('Eve later acknowledged');
    });

    it('puts run-specific evidence in the evidence packet with the required sections', () => {
      const packet = buildReconcilerEvidencePacket(reconcilerContext);

      expect(packet).toContain('1. EMOTIONAL ANCHOR (Stage 1)');
      expect(packet).toContain('2. FACTUAL BASELINE (Ledger)');
      expect(packet).toContain('3. RECENT SIGNAL (Stage 2 Hot Buffer)');
      expect(packet).toContain('If Section 3 contradicts Section 2 or Stage 1 factual claims');
      expect(packet).toContain('Adam');
      expect(packet).toContain('Eve');
      expect(packet).toContain('[Conflict] Eve later acknowledged yelling during the argument.');
      expect(packet).toContain('Stage 2 AI framing prompt: Did you actually yell?');
      expect(packet).toContain('Stage 2 Eve subject-owned reply: Yeah, I did.');
    });
  });

  describe('Response Protocol (Semantic Router)', () => {
    it('Stage 1 protocol includes FeelHeardCheck flag instruction', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('<thinking>');
      // The flag instruction is in format "FeelHeardCheck: [Y if ready..., N otherwise]"
      expect(prompt).toContain('FeelHeardCheck:');
      expect(prompt).not.toContain('FeelHeardConfirmed:');
      expect(prompt).toMatch(/FeelHeardCheck.*Y.*N/s);
      expect(prompt).toContain('Do NOT invite more freeform chat unless the input remains visible');
    });

    it('Stage 2 protocol includes ReadyShare flag instruction', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(2, context));

      expect(prompt).toContain('<thinking>');
      // The flag instruction is in format "ReadyShare: [Y if ready..., N otherwise]"
      expect(prompt).toContain('ReadyShare:');
      expect(prompt).toMatch(/ReadyShare.*Y.*N/s);
      expect(prompt).toContain('Do NOT invite more freeform chat unless the input remains visible');
    });

    it('Stage 0 protocol instructs the AI to emit a topic via <draft> tags', () => {
      const context = createContext();
      const options: BuildStagePromptOptions = { isInvitationPhase: true };
      const prompt = fullPrompt(buildStagePrompt(0, context, options));

      // Stage 0 now emits the proposed TOPIC inline as <draft> (not an invitation message).
      expect(prompt).toContain('<draft>');
      expect(prompt).toContain('without inviting freeform chat unless the input remains visible');
    });

    it('protocol includes dispatch tag instruction', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(1, context));

      expect(prompt).toContain('<dispatch>');
      expect(prompt).toContain('EXPLAIN_PROCESS');
    });

    it('protocol keeps control flags as thinking lines, not ad hoc XML tags', () => {
      const context = createContext();
      const prompt = fullPrompt(buildStagePrompt(3, context));

      expect(prompt).toContain('The only XML-style tags you may use are exactly <thinking>, <draft>, <needs>, and <dispatch>.');
      expect(prompt).toContain('Flags such as FeelHeardCheck, ReadyShare, NeedsReady, Mode, and Strategy must be plain lines inside <thinking>');
      expect(prompt).toContain('never turn them into tags like <needs_ready>, <ready_share>, or <feel_heard_check>');
      expect(prompt).toContain('The <needs> tag is only for the structured Stage 3 needs JSON shown above');
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

  describe('topicFrame in dynamic guidance', () => {
    it('includes topicFrame in dynamic block for stages 1–4 when provided', () => {
      for (const stage of [1, 2, 3, 4]) {
        const blocks = buildStagePrompt(stage, createContext({ topicFrame: 'Mealtime poking' }));
        expect(blocks.dynamicBlock).toContain('CONVERSATION TOPIC: "Mealtime poking"');
      }
    });

    it('omits topicFrame from dynamic block when null', () => {
      const blocks = buildStagePrompt(1, createContext({ topicFrame: null }));
      expect(blocks.dynamicBlock).not.toContain('CONVERSATION TOPIC');
    });

    it('omits topicFrame from dynamic block when undefined', () => {
      const blocks = buildStagePrompt(1, createContext());
      expect(blocks.dynamicBlock).not.toContain('CONVERSATION TOPIC');
    });
  });

  describe('buildStagePrompt — Stage 1 witness cadence', () => {
    it('keeps the first high-resistance final open-floor check separate from the felt-heard gate', () => {
      const blocks = buildStagePrompt(1, createContext({ turnCount: 5 }));

      expect(blocks.staticBlock).toContain('make one final open-floor move with FeelHeardCheck:N');
      expect(blocks.staticBlock).toContain('do not set FeelHeardCheck:Y in the same response as the first final open-floor check');
      expect(blocks.staticBlock).toContain('Never end a response with an open question while setting FeelHeardCheck:Y');
      expect(blocks.staticBlock).toContain('Keep FeelHeardCheck:N until the user has had a chance to answer it and you have reflected that answer');
    });

    it('keeps the dynamic feel-heard guard active before turn 5', () => {
      const blocks = buildStagePrompt(1, createContext({ turnCount: 4 }));

      expect(blocks.dynamicBlock).toContain('Feel-heard guard: Too early for most Stage 1 cases (turn < 5)');
    });
  });
});
