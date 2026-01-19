/**
 * Partner Session Classifier Tests
 *
 * Tests for notable facts extraction in the background classifier.
 */

// Mock embedding service first (before any imports)
jest.mock('../embedding', () => ({
  embedSessionContent: jest.fn().mockResolvedValue(true),
}));

// Mock circuit breaker to execute immediately without timeout
jest.mock('../../utils/circuit-breaker', () => ({
  withHaikuCircuitBreaker: jest.fn().mockImplementation(async (fn) => fn()),
  withTimeout: jest.fn().mockImplementation(async (fn) => fn()),
  HAIKU_TIMEOUT_MS: 20000,
}));

// Mock Bedrock for Haiku calls - returns categorized facts
jest.mock('../../lib/bedrock', () => ({
  getHaikuJson: jest.fn().mockResolvedValue({
    topicContext: 'discussing relationship',
    notableFacts: [
      { category: 'People', fact: 'User has a daughter named Emma' },
      { category: 'Logistics', fact: 'Partner works night shifts' },
    ],
  }),
  BrainActivityCallType: {
    PARTNER_SESSION_CLASSIFICATION: 'PARTNER_SESSION_CLASSIFICATION',
  },
}));

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    userVessel: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
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
    it('extracts categorized notable facts from Haiku response', async () => {
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
        { category: 'People', fact: 'User has a daughter named Emma' },
        { category: 'Logistics', fact: 'Partner works night shifts' },
      ]);
    });

    it('saves categorized notable facts to UserVessel', async () => {
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
          notableFacts: [
            { category: 'People', fact: 'User has a daughter named Emma' },
            { category: 'Logistics', fact: 'Partner works night shifts' },
          ],
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

    it('passes Sonnet analysis to Haiku for better fact extraction', async () => {
      const sonnetAnalysis = 'The user is expressing frustration about work-life balance';
      const sonnetResponse = 'I hear that you\'re feeling overwhelmed by competing priorities...';

      await runPartnerSessionClassifier({
        userMessage: 'I just cant seem to balance everything',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
        sonnetAnalysis,
        sonnetResponse,
      });

      // Verify getHaikuJson was called with a prompt containing Sonnet's analysis
      expect(getHaikuJson).toHaveBeenCalled();
      const call = (getHaikuJson as jest.Mock).mock.calls[0][0];
      expect(call.messages[0].content).toContain("SONNET'S ANALYSIS");
      expect(call.messages[0].content).toContain(sonnetAnalysis);
      expect(call.messages[0].content).toContain("SONNET'S RESPONSE");
      expect(call.messages[0].content).toContain(sonnetResponse);
    });

    it('does not include Sonnet section when analysis is not provided', async () => {
      await runPartnerSessionClassifier({
        userMessage: 'Just a regular message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(getHaikuJson).toHaveBeenCalled();
      const call = (getHaikuJson as jest.Mock).mock.calls[0][0];
      expect(call.messages[0].content).not.toContain("SONNET'S ANALYSIS");
    });

    it('limits facts to 20 items', async () => {
      const manyFacts = Array.from({ length: 25 }, (_, i) => ({
        category: 'People',
        fact: `Fact ${i + 1}`,
      }));
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
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

    it('filters out invalid facts (empty, wrong types, missing fields)', async () => {
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        notableFacts: [
          { category: 'People', fact: 'Valid fact' },
          { category: '', fact: 'Empty category' }, // Empty category - filtered
          { category: 'Emotional', fact: '' }, // Empty fact - filtered
          { category: 'History' }, // Missing fact - filtered
          { fact: 'Missing category' }, // Missing category - filtered
          null, // null - filtered
          'string only', // Plain string - filtered
          { category: 'Logistics', fact: 'Another valid fact' },
        ],
      });

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result?.notableFacts).toEqual([
        { category: 'People', fact: 'Valid fact' },
        { category: 'Logistics', fact: 'Another valid fact' },
      ]);
    });

    it('returns undefined notableFacts on Haiku timeout (fallback)', async () => {
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

      // On failure, notableFacts should be undefined (don't overwrite existing)
      expect(result?.notableFacts).toBeUndefined();
    });

    it('does not include memory detection tasks in prompt', async () => {
      await runPartnerSessionClassifier({
        userMessage: 'Remember that I prefer short responses',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(getHaikuJson).toHaveBeenCalled();
      const call = (getHaikuJson as jest.Mock).mock.calls[0][0];
      // Memory detection tasks should NOT be in the prompt
      expect(call.messages[0].content).not.toContain('MEMORY INTENT DETECTION');
      expect(call.messages[0].content).not.toContain('MEMORY VALIDATION');
      expect(call.messages[0].content).not.toContain('TASK 1');
      expect(call.messages[0].content).not.toContain('TASK 2');
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

    it('handles response with only topic context (no facts)', async () => {
      (getHaikuJson as jest.Mock).mockResolvedValueOnce({
        topicContext: 'some context',
      });

      const result = await runPartnerSessionClassifier({
        userMessage: 'Test message',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(result).not.toBeNull();
      expect(result?.topicContext).toBe('some context');
      expect(result?.notableFacts).toBeUndefined();
    });
  });
});
