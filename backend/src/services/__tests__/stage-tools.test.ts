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
    expect(SESSION_STATE_TOOL.toolSpec?.name).toBe('update_session_state');
    expect(SESSION_STATE_TOOL_NAME).toBe('update_session_state');
  });

  it('should have a description', () => {
    expect(SESSION_STATE_TOOL.toolSpec?.description).toBeDefined();
    expect(SESSION_STATE_TOOL.toolSpec?.description?.length).toBeGreaterThan(50);
  });

  it('should define all required properties in schema', () => {
    const schema = SESSION_STATE_TOOL.toolSpec?.inputSchema?.json as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;

    expect(properties.offerFeelHeardCheck).toBeDefined();
    expect(properties.offerReadyToShare).toBeDefined();
    expect(properties.proposedEmpathyStatement).toBeDefined();
    expect(properties.invitationMessage).toBeDefined();
    // Note: analysis is no longer in the tool - it's now in the <analysis> XML block
  });
});

describe('parseSessionStateToolInput', () => {
  it('should parse valid input correctly', () => {
    const input = {
      offerFeelHeardCheck: true,
      offerReadyToShare: false,
      proposedEmpathyStatement: 'I feel overwhelmed...',
      invitationMessage: 'Can we talk?',
    };

    const result = parseSessionStateToolInput(input);

    expect(result.offerFeelHeardCheck).toBe(true);
    expect(result.offerReadyToShare).toBe(false);
    expect(result.proposedEmpathyStatement).toBe('I feel overwhelmed...');
    expect(result.invitationMessage).toBe('Can we talk?');
  });

  it('should default boolean fields to false when missing', () => {
    const result = parseSessionStateToolInput({});

    expect(result.offerFeelHeardCheck).toBe(false);
    expect(result.offerReadyToShare).toBe(false);
  });

  it('should leave string fields undefined when missing', () => {
    const result = parseSessionStateToolInput({});

    expect(result.proposedEmpathyStatement).toBeUndefined();
    expect(result.invitationMessage).toBeUndefined();
  });

  it('should handle wrong types gracefully', () => {
    const input = {
      offerFeelHeardCheck: 'yes', // Wrong type
      proposedEmpathyStatement: 123, // Wrong type
    };

    const result = parseSessionStateToolInput(input);

    expect(result.offerFeelHeardCheck).toBe(false);
    expect(result.proposedEmpathyStatement).toBeUndefined();
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
