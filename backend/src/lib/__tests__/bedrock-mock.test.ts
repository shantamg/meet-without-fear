/**
 * Bedrock Mock LLM Tests
 *
 * Tests for the MOCK_LLM toggle that enables deterministic AI responses for E2E tests.
 */

import { isMockLLMEnabled, getModelCompletion } from '../bedrock';

// Mock brainService to avoid side effects
jest.mock('../../services/brain-service', () => ({
  brainService: {
    startActivity: jest.fn().mockResolvedValue({ id: 'mock-activity' }),
    endActivity: jest.fn().mockResolvedValue(undefined),
  },
  BrainActivityCallType: {
    ORCHESTRATED_RESPONSE: 'ORCHESTRATED_RESPONSE',
  },
}));

// Mock llm-telemetry
jest.mock('../../services/llm-telemetry', () => ({
  recordLlmCall: jest.fn(),
}));

describe('Bedrock Mock LLM Toggle', () => {
  const originalEnv = process.env.MOCK_LLM;

  afterEach(() => {
    if (originalEnv) {
      process.env.MOCK_LLM = originalEnv;
    } else {
      delete process.env.MOCK_LLM;
    }
  });

  describe('isMockLLMEnabled', () => {
    it('returns true when MOCK_LLM=true', () => {
      process.env.MOCK_LLM = 'true';
      expect(isMockLLMEnabled()).toBe(true);
    });

    it('returns false when MOCK_LLM is not set', () => {
      delete process.env.MOCK_LLM;
      expect(isMockLLMEnabled()).toBe(false);
    });

    it('returns false when MOCK_LLM is false', () => {
      process.env.MOCK_LLM = 'false';
      expect(isMockLLMEnabled()).toBe(false);
    });
  });

  describe('getModelCompletion with MOCK_LLM', () => {
    it('returns null immediately when MOCK_LLM=true', async () => {
      process.env.MOCK_LLM = 'true';
      // Set AWS credentials so we know it's not returning null due to missing creds
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';

      const result = await getModelCompletion('sonnet', {
        systemPrompt: 'Test prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        sessionId: 'test-session',
        turnId: 'test-turn-0',
        operation: 'test-mock',
      });

      expect(result).toBeNull();
    });
  });
});
