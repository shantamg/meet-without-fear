/**
 * Tests for Stage Tools (Tool Use definitions)
 */

import {
  SESSION_STATE_TOOL,
  SESSION_STATE_TOOL_NAME,
  parseSessionStateToolInput,
  getToolsForStage,
} from '../stage-tools';

describe('SESSION_STATE_TOOL', () => {
  it('should have correct tool name', () => {
    expect(SESSION_STATE_TOOL.name).toBe('update_session_state');
    expect(SESSION_STATE_TOOL_NAME).toBe('update_session_state');
  });

  it('should have a description', () => {
    expect(SESSION_STATE_TOOL.description).toBeDefined();
    expect(SESSION_STATE_TOOL.description.length).toBeGreaterThan(50);
  });

  it('should define all required properties in schema', () => {
    const schema = SESSION_STATE_TOOL.input_schema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;

    expect(properties.offerFeelHeardCheck).toBeDefined();
    expect(properties.offerReadyToShare).toBeDefined();
    expect(properties.proposedEmpathyStatement).toBeDefined();
    expect(properties.stage4Proposals).toBeDefined();
    expect(properties.stage4WalkthroughAction).toBeDefined();
  });
});

describe('parseSessionStateToolInput', () => {
  it('should parse valid input correctly', () => {
    const input = {
      topicFrame: 'Being interrupted during dinner',
      offerFeelHeardCheck: true,
      offerReadyToShare: false,
      proposedEmpathyStatement: 'I feel overwhelmed...',
    };

    const result = parseSessionStateToolInput(input);

    expect(result.topicFrame).toBe('Being interrupted during dinner');
    expect(result.offerFeelHeardCheck).toBe(true);
    expect(result.offerReadyToShare).toBe(false);
    expect(result.proposedEmpathyStatement).toBe('I feel overwhelmed...');
  });

  it('should leave boolean fields undefined when missing', () => {
    const result = parseSessionStateToolInput({});

    expect(result.offerFeelHeardCheck).toBeUndefined();
    expect(result.offerReadyToShare).toBeUndefined();
  });

  it('should leave string fields undefined when missing', () => {
    const result = parseSessionStateToolInput({});

    expect(result.proposedEmpathyStatement).toBeUndefined();
  });

  it('should handle wrong types gracefully', () => {
    const input = {
      offerFeelHeardCheck: 'yes', // Wrong type
      proposedEmpathyStatement: 123, // Wrong type
    };

    const result = parseSessionStateToolInput(input);

    expect(result.offerFeelHeardCheck).toBeUndefined();
    expect(result.proposedEmpathyStatement).toBeUndefined();
  });

  it('should parse Stage 4 proposal and walkthrough state', () => {
    const result = parseSessionStateToolInput({
      stage4Proposals: [
        {
          action: 'ADD',
          classification: 'PROPOSAL',
          description: 'Play 20 Questions for ten minutes after dinner',
          kind: 'SHARED_PROPOSAL',
          ownerUserId: null,
          needsAddressed: [' need-1 '],
          duration: 'ten minutes',
          measureOfSuccess: 'Both people feel lighter',
        },
      ],
      stage4WalkthroughAction: {
        action: 'COVERED',
        needId: 'need-1',
        reason: 'The user agreed this is enough to move on.',
      },
    });

    expect(result.stage4Proposals).toHaveLength(1);
    expect(result.stage4Proposals?.[0]).toMatchObject({
      action: 'ADD',
      classification: 'PROPOSAL',
      description: 'Play 20 Questions for ten minutes after dinner',
      kind: 'SHARED_PROPOSAL',
      needsAddressed: ['need-1'],
      duration: 'ten minutes',
      measureOfSuccess: 'Both people feel lighter',
    });
    expect(result.stage4WalkthroughAction).toEqual({
      action: 'COVERED',
      needId: 'need-1',
      reason: 'The user agreed this is enough to move on.',
    });
  });

  it('should parse Stage 3 need capture and actions', () => {
    const result = parseSessionStateToolInput({
      proposedNeed: {
        need: 'to be taken seriously',
        category: 'RECOGNITION',
        description: 'To feel taken seriously when I set a boundary',
        evidence: ['taken seriously'],
      },
      needAction: {
        type: 'refine',
        supersedes: 'need-old',
        need: 'to be heard',
        category: 'RECOGNITION',
        description: 'To feel heard when I set a boundary',
        evidence: ['heard'],
      },
    });

    expect(result.proposedNeed).toEqual({
      need: 'to be taken seriously',
      category: 'RECOGNITION',
      description: 'To feel taken seriously when I set a boundary',
      evidence: ['taken seriously'],
    });
    expect(result.needAction).toEqual({
      type: 'refine',
      needId: undefined,
      supersedes: 'need-old',
      need: 'to be heard',
      category: 'RECOGNITION',
      description: 'To feel heard when I set a boundary',
      evidence: ['heard'],
    });
  });

  it('should ignore invalid Stage 4 tool payloads', () => {
    const result = parseSessionStateToolInput({
      stage4Proposals: [
        {
          action: 'ADD',
          classification: 'PROPOSAL',
          description: '   ',
        },
        {
          action: 'BOGUS',
          classification: 'PROPOSAL',
          description: 'Valid text with invalid action',
        },
      ],
      stage4WalkthroughAction: { action: 'BOGUS' },
    });

    expect(result.stage4Proposals).toBeUndefined();
    expect(result.stage4WalkthroughAction).toBeUndefined();
  });
});

describe('getToolsForStage', () => {
  it('should return SESSION_STATE_TOOL for all stages', () => {
    const stages = [0, 1, 2, 3, 4];

    for (const stage of stages) {
      const tools = getToolsForStage(stage);
      expect(tools).toHaveLength(1);
      expect(tools[0]).toBe(SESSION_STATE_TOOL);
    }
  });
});
