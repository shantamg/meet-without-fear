/**
 * Partner Session Classifier Tests
 *
 * Tests for notable facts extraction and memory intent detection
 * in the consolidated background classifier.
 */

// Mock circuit breaker to execute immediately without timeout
jest.mock('../../utils/circuit-breaker', () => ({
  withHaikuCircuitBreaker: jest.fn().mockImplementation(async (fn) => fn()),
  withTimeout: jest.fn().mockImplementation(async (fn) => fn()),
  HAIKU_TIMEOUT_MS: 20000,
}));

// Mock Bedrock for Haiku calls
jest.mock('../../lib/bedrock', () => ({
  getHaikuJson: jest.fn().mockResolvedValue({
    memoryIntent: { detected: false, confidence: 'low' },
    topicContext: 'discussing relationship',
    notableFacts: ['User has a daughter named Emma', 'Partner works night shifts'],
  }),
}));

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    userVessel: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

// Mock realtime publishing
jest.mock('../realtime', () => ({
  publishUserEvent: jest.fn().mockResolvedValue(undefined),
}));

// Mock memory service
jest.mock('../memory-service', () => ({
  memoryService: {
    createPendingMemory: jest.fn().mockResolvedValue({ id: 'mem-123' }),
  },
}));

import { runPartnerSessionClassifier } from '../partner-session-classifier';
import { getHaikuJson } from '../../lib/bedrock';
import { prisma } from '../../lib/prisma';

describe('Partner Session Classifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Notable Facts Extraction', () => {
    it('extracts notable facts from Haiku response', async () => {
      const result = await runPartnerSessionClassifier({
        userMessage: 'My daughter Emma is struggling with school',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
        partnerName: 'Alex',
      });

      expect(result).not.toBeNull();
      expect(result?.notableFacts).toEqual([
        'User has a daughter named Emma',
        'Partner works night shifts',
      ]);
    });

    it('saves notable facts to UserVessel', async () => {
      await runPartnerSessionClassifier({
        userMessage: 'We have been married for 10 years',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(prisma.userVessel.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-456',
          sessionId: 'session-123',
        },
        data: {
          notableFacts: ['User has a daughter named Emma', 'Partner works night shifts'],
        },
      });
    });

    it('passes existing facts to Haiku for consolidation', async () => {
      const existingFacts = ['User lives in NYC', 'Has two children'];

      await runPartnerSessionClassifier({
        userMessage: 'I feel overwhelmed',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
        existingFacts,
      });

      // Verify getHaikuJson was called with a prompt containing existing facts
      expect(getHaikuJson).toHaveBeenCalled();
      const call = (getHaikuJson as jest.Mock).mock.calls[0][0];
      expect(call.messages[0].content).toContain('User lives in NYC');
      expect(call.messages[0].content).toContain('Has two children');
    });

    it('limits facts to 20 items', async () => {
      const manyFacts = Array.from({ length: 25 }, (_, i) => `Fact ${i + 1}`);
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        memoryIntent: { detected: false, confidence: 'low' },
        notableFacts: manyFacts,
      });

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result?.notableFacts).toHaveLength(20);
    });

    it('filters out empty and non-string facts', async () => {
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        memoryIntent: { detected: false, confidence: 'low' },
        notableFacts: ['Valid fact', '', '   ', null, 123, 'Another valid fact'],
      });

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result?.notableFacts).toEqual(['Valid fact', 'Another valid fact']);
    });

    it('preserves existing facts on Haiku timeout', async () => {
      const existingFacts = ['Preserved fact 1', 'Preserved fact 2'];

      // Simulate Haiku returning null (timeout)
      (getHaikuJson as jest.Mock).mockResolvedValueOnce(null);

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
        existingFacts,
      });

      // Should return existing facts as fallback
      expect(result?.notableFacts).toEqual(existingFacts);
    });
  });

  describe('Memory Intent Detection', () => {
    it('detects explicit memory intent', async () => {
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        memoryIntent: {
          detected: true,
          suggestedMemory: 'User prefers brief responses',
          category: 'COMMUNICATION',
          confidence: 'high',
          evidence: 'Keep your responses short',
          isValid: true,
        },
        topicContext: 'communication preferences',
        notableFacts: [],
      });

      const result = await runPartnerSessionClassifier({
        userMessage: 'Keep your responses short from now on',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result?.memoryIntent.detected).toBe(true);
      expect(result?.memoryIntent.suggestedMemory).toBe('User prefers brief responses');
      expect(result?.memoryIntent.category).toBe('COMMUNICATION');
    });

    it('normalizes category to uppercase', async () => {
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        memoryIntent: {
          detected: true,
          suggestedMemory: 'Partner name is Alex',
          category: 'relationship', // lowercase
          confidence: 'high',
          isValid: true,
        },
        notableFacts: [],
      });

      const result = await runPartnerSessionClassifier({
        userMessage: "My partner's name is Alex",
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result?.memoryIntent.category).toBe('RELATIONSHIP');
    });

    it('rejects invalid memory categories', async () => {
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        memoryIntent: {
          detected: true,
          suggestedMemory: 'Something',
          category: 'INVALID_CATEGORY',
          confidence: 'high',
          isValid: true,
        },
        notableFacts: [],
      });

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result?.memoryIntent.category).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('returns null on complete failure', async () => {
      (getHaikuJson as jest.Mock).mockRejectedValueOnce(new Error('API error'));

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result).toBeNull();
    });

    it('handles missing memoryIntent in response', async () => {
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        topicContext: 'some context',
        notableFacts: ['A fact'],
      });

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result).not.toBeNull();
      expect(result?.memoryIntent.detected).toBe(false);
      expect(result?.memoryIntent.confidence).toBe('low');
    });
  });
});
