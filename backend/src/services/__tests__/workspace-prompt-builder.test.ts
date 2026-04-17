/**
 * Workspace Prompt Builder Tests
 */

import {
  buildSlackStagePrompt,
  getWorkspaceStatus,
  __resetWorkspaceCache,
} from '../workspace-prompt-builder';
import type { ContextBundle } from '../context-assembler';
import type { PromptContext } from '../stage-prompts';

describe('Workspace Prompt Builder', () => {
  beforeEach(() => {
    __resetWorkspaceCache();
  });

  const makeBundle = (): ContextBundle => ({
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
    stageContext: { stage: 1, gatesSatisfied: {} },
    userName: 'Alice',
    intent: {
      intent: 'emotional_validation',
      depth: 'light',
      reason: 'test',
      threshold: 0.5,
      maxCrossSession: 0,
      allowCrossSession: false,
      surfaceStyle: 'silent',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    assembledAt: new Date().toISOString(),
  });

  const makeContext = (overrides: Partial<PromptContext> = {}): PromptContext => ({
    userName: 'Alice',
    partnerName: 'Bob',
    turnCount: 1,
    emotionalIntensity: 5,
    contextBundle: makeBundle(),
    ...overrides,
  });

  it('loads workspace files and produces non-empty blocks for Stage 1', () => {
    const blocks = buildSlackStagePrompt(1, makeContext());
    expect(blocks.staticBlock.length).toBeGreaterThan(100);
    expect(blocks.dynamicBlock.length).toBeGreaterThan(10);
  });

  it('embeds the guardian constitution and stage CONTEXT in the static block', () => {
    const blocks = buildSlackStagePrompt(1, makeContext());
    expect(blocks.staticBlock).toContain('Process Guardian');
    expect(blocks.staticBlock).toContain('Stage 1');
    // Witness-specific language should be present
    expect(blocks.staticBlock.toLowerCase()).toContain('listen');
  });

  it('includes the micro-tag response protocol', () => {
    const blocks = buildSlackStagePrompt(1, makeContext());
    expect(blocks.staticBlock).toContain('<thinking>');
    expect(blocks.staticBlock).toContain('FeelHeardCheck');
    expect(blocks.staticBlock).toContain('<dispatch>');
  });

  it('includes slack-specific formatting guidance', () => {
    const blocks = buildSlackStagePrompt(1, makeContext());
    expect(blocks.staticBlock).toContain('SLACK FORMATTING');
    expect(blocks.staticBlock).toContain('mrkdwn');
  });

  it('sets stage-specific flags for stage 2 (ReadyShare)', () => {
    const blocks = buildSlackStagePrompt(2, makeContext());
    expect(blocks.staticBlock).toContain('ReadyShare');
  });

  it('sets stage-specific flags for stage 4 (StrategyProposed)', () => {
    const blocks = buildSlackStagePrompt(4, makeContext());
    expect(blocks.staticBlock).toContain('StrategyProposed');
  });

  it('includes turn count and intensity in the dynamic block', () => {
    const blocks = buildSlackStagePrompt(
      1,
      makeContext({ turnCount: 6, emotionalIntensity: 7 })
    );
    expect(blocks.dynamicBlock).toContain('Turn: 6');
    expect(blocks.dynamicBlock).toContain('Emotional intensity: 7/10');
  });

  it('warns on very high intensity', () => {
    const blocks = buildSlackStagePrompt(
      1,
      makeContext({ emotionalIntensity: 9 })
    );
    expect(blocks.dynamicBlock).toContain('HIGH INTENSITY');
  });

  it('guards against too-early feel-heard on stage 1', () => {
    const blocks = buildSlackStagePrompt(
      1,
      makeContext({ turnCount: 1 })
    );
    expect(blocks.dynamicBlock).toContain('Feel-heard guard');
  });

  it('signals stage transition when requested', () => {
    const blocks = buildSlackStagePrompt(2, makeContext(), {
      isStageTransition: true,
      previousStage: 1,
    });
    expect(blocks.dynamicBlock).toContain('STAGE TRANSITION');
    expect(blocks.dynamicBlock).toContain('1 to stage 2');
  });

  it('falls back cleanly via fallbackOnly option', () => {
    const blocks = buildSlackStagePrompt(1, makeContext(), { fallbackOnly: true });
    expect(blocks.staticBlock).toBeTruthy();
    expect(blocks.dynamicBlock).toBeTruthy();
  });

  it('reports loaded stages via getWorkspaceStatus', () => {
    const status = getWorkspaceStatus();
    expect(status.stagesLoaded).toEqual(expect.arrayContaining([0, 1, 2, 3, 4]));
    expect(status.guardianLoaded).toBe(true);
  });
});
