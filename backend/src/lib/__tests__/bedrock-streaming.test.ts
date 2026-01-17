/**
 * Tests for Bedrock Streaming functionality
 */

import { getSonnetStreamingResponse, StreamEvent, resetBedrockClient } from '../bedrock';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime', () => {
  const actual = jest.requireActual('@aws-sdk/client-bedrock-runtime');
  return {
    ...actual,
    BedrockRuntimeClient: jest.fn(),
  };
});

// Mock brain service
jest.mock('../../services/brain-service', () => ({
  brainService: {
    startActivity: jest.fn().mockResolvedValue({ id: 'test-activity-id' }),
    completeActivity: jest.fn().mockResolvedValue(undefined),
    failActivity: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('getSonnetStreamingResponse', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    resetBedrockClient();

    // Set up AWS credentials for client initialization
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.AWS_REGION = 'us-east-1';

    // Mock the BedrockRuntimeClient constructor
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  afterEach(() => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
    resetBedrockClient();
  });

  it('should yield text chunks as they arrive', async () => {
    // Create an async generator that simulates Bedrock streaming
    async function* mockStream() {
      yield { contentBlockDelta: { delta: { text: 'Hello' } } };
      yield { contentBlockDelta: { delta: { text: ', ' } } };
      yield { contentBlockDelta: { delta: { text: 'world!' } } };
      yield { metadata: { usage: { inputTokens: 10, outputTokens: 5 } } };
    }

    mockSend.mockResolvedValue({ stream: mockStream() });

    const events: StreamEvent[] = [];
    for await (const event of getSonnetStreamingResponse({
      systemPrompt: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Say hello' }],
      sessionId: 'test-session',
      turnId: 'test-turn',
      operation: 'test',
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(events[1]).toEqual({ type: 'text', text: ', ' });
    expect(events[2]).toEqual({ type: 'text', text: 'world!' });
    expect(events[3]).toEqual({
      type: 'done',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it('should accumulate and yield tool use results', async () => {
    async function* mockStream() {
      // Text output first
      yield { contentBlockDelta: { delta: { text: 'I will update the state.' } } };
      // Tool use block
      yield {
        contentBlockStart: {
          start: { toolUse: { toolUseId: 'tool-123', name: 'update_session_state' } },
        },
      };
      yield { contentBlockDelta: { delta: { toolUse: { input: '{"offer' } } } };
      yield { contentBlockDelta: { delta: { toolUse: { input: 'FeelHeardCheck":true}' } } } };
      yield { contentBlockStop: {} };
      yield { metadata: { usage: { inputTokens: 50, outputTokens: 30 } } };
    }

    mockSend.mockResolvedValue({ stream: mockStream() });

    const events: StreamEvent[] = [];
    for await (const event of getSonnetStreamingResponse({
      systemPrompt: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Help me' }],
      tools: [
        {
          toolSpec: {
            name: 'update_session_state',
            description: 'Update session state',
            inputSchema: {
              json: { type: 'object', properties: { offerFeelHeardCheck: { type: 'boolean' } } },
            },
          },
        },
      ],
      sessionId: 'test-session',
      turnId: 'test-turn',
      operation: 'test',
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'text', text: 'I will update the state.' });
    expect(events[1]).toEqual({
      type: 'tool_use',
      toolUseId: 'tool-123',
      name: 'update_session_state',
      input: { offerFeelHeardCheck: true },
    });
    expect(events[2]).toEqual({
      type: 'done',
      usage: { inputTokens: 50, outputTokens: 30 },
    });
  });

  it('should handle empty tool input gracefully', async () => {
    async function* mockStream() {
      yield {
        contentBlockStart: {
          start: { toolUse: { toolUseId: 'tool-456', name: 'some_tool' } },
        },
      };
      yield { contentBlockStop: {} };
      yield { metadata: { usage: { inputTokens: 20, outputTokens: 10 } } };
    }

    mockSend.mockResolvedValue({ stream: mockStream() });

    const events: StreamEvent[] = [];
    for await (const event of getSonnetStreamingResponse({
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Test' }],
      sessionId: 'test-session',
      turnId: 'test-turn',
      operation: 'test',
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'tool_use',
      toolUseId: 'tool-456',
      name: 'some_tool',
      input: {},
    });
  });

  it('should yield done with zero usage when client is not configured', async () => {
    // Clear AWS credentials
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    resetBedrockClient();

    const events: StreamEvent[] = [];
    for await (const event of getSonnetStreamingResponse({
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Test' }],
      sessionId: 'test-session',
      turnId: 'test-turn',
      operation: 'test',
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'done',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });
});
