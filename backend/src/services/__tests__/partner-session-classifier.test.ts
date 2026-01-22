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

import {
  runPartnerSessionClassifier,
  applyFactUpdates,
  ensureFactIds,
  generateRandomShortId,
  createIdMapping,
  resolveShortIds,
  CategorizedFactWithId,
  FactUpdatePayload,
  IdMapping,
} from '../partner-session-classifier';
import { getHaikuJson } from '../../lib/bedrock';
import { prisma } from '../../lib/prisma';

// ============================================================================
// Short ID Mapping Tests
// ============================================================================

describe('Short ID Mapping', () => {
  describe('generateRandomShortId', () => {
    it('generates 5-character alphanumeric IDs', () => {
      const id = generateRandomShortId();
      expect(id).toHaveLength(5);
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    it('generates different IDs on each call', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRandomShortId());
      }
      // With random generation, we expect high uniqueness
      expect(ids.size).toBeGreaterThan(95);
    });
  });

  describe('createIdMapping', () => {
    it('creates bidirectional mapping from facts to random short IDs', () => {
      const facts: CategorizedFactWithId[] = [
        { id: 'uuid-111-aaa', category: 'People', fact: 'Fact 1' },
        { id: 'uuid-222-bbb', category: 'Logistics', fact: 'Fact 2' },
      ];

      const mapping = createIdMapping(facts);

      // Verify mapping size
      expect(mapping.shortToFull.size).toBe(2);
      expect(mapping.fullToShort.size).toBe(2);

      // Verify bidirectional consistency
      const shortId1 = mapping.fullToShort.get('uuid-111-aaa')!;
      const shortId2 = mapping.fullToShort.get('uuid-222-bbb')!;
      expect(mapping.shortToFull.get(shortId1)).toBe('uuid-111-aaa');
      expect(mapping.shortToFull.get(shortId2)).toBe('uuid-222-bbb');

      // Verify short IDs are 5 chars
      expect(shortId1).toHaveLength(5);
      expect(shortId2).toHaveLength(5);

      // Verify short IDs are unique
      expect(shortId1).not.toBe(shortId2);
    });

    it('handles empty facts array', () => {
      const mapping = createIdMapping([]);
      expect(mapping.shortToFull.size).toBe(0);
      expect(mapping.fullToShort.size).toBe(0);
    });

    it('generates unique IDs even with many facts', () => {
      const facts: CategorizedFactWithId[] = Array.from({ length: 20 }, (_, i) => ({
        id: `uuid-${i}`,
        category: 'People',
        fact: `Fact ${i}`,
      }));

      const mapping = createIdMapping(facts);

      // All 20 should have unique short IDs
      expect(mapping.shortToFull.size).toBe(20);
      expect(mapping.fullToShort.size).toBe(20);
    });
  });

  describe('resolveShortIds', () => {
    it('resolves short IDs back to full UUIDs in upsert array', () => {
      const mapping: IdMapping = {
        shortToFull: new Map([
          ['aa0000', 'full-uuid-1'],
          ['ab0001', 'full-uuid-2'],
        ]),
        fullToShort: new Map([
          ['full-uuid-1', 'aa0000'],
          ['full-uuid-2', 'ab0001'],
        ]),
      };

      const factUpdates: FactUpdatePayload = {
        upsert: [
          { id: 'aa0000', category: 'People', fact: 'Updated fact' },
          { category: 'Emotional', fact: 'New fact without ID' },
        ],
        delete: [],
      };

      const resolved = resolveShortIds(factUpdates, mapping);

      expect(resolved.upsert[0].id).toBe('full-uuid-1');
      expect(resolved.upsert[1].id).toBeUndefined();
    });

    it('resolves short IDs in delete array', () => {
      const mapping: IdMapping = {
        shortToFull: new Map([
          ['aa0000', 'full-uuid-1'],
          ['ab0001', 'full-uuid-2'],
          ['ac0002', 'full-uuid-3'],
        ]),
        fullToShort: new Map(),
      };

      const factUpdates: FactUpdatePayload = {
        upsert: [],
        delete: ['ab0001', 'ac0002'],
      };

      const resolved = resolveShortIds(factUpdates, mapping);

      expect(resolved.delete).toEqual(['full-uuid-2', 'full-uuid-3']);
    });

    it('preserves IDs that are not in the mapping', () => {
      const mapping: IdMapping = {
        shortToFull: new Map([['aa0000', 'full-uuid-1']]),
        fullToShort: new Map(),
      };

      const factUpdates: FactUpdatePayload = {
        upsert: [
          { id: 'unknown-id', category: 'People', fact: 'Some fact' },
        ],
        delete: ['unknown-delete-id'],
      };

      const resolved = resolveShortIds(factUpdates, mapping);

      // Unknown IDs are preserved as-is
      expect(resolved.upsert[0].id).toBe('unknown-id');
      expect(resolved.delete[0]).toBe('unknown-delete-id');
    });
  });
});

// ============================================================================
// Partner Session Classifier Tests
// ============================================================================

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

    it('saves categorized notable facts with IDs to UserVessel', async () => {
      await runPartnerSessionClassifier({
        userMessage: 'We have been married for 10 years',
        conversationHistory: [],
        sessionId: 'session-123',
        userId: 'user-456',
        turnId: 'turn-1',
      });

      expect(prisma.userVessel.updateMany).toHaveBeenCalled();
      const updateCall = (prisma.userVessel.updateMany as jest.Mock).mock.calls[0][0];

      expect(updateCall.where).toEqual({
        userId: 'user-456',
        sessionId: 'session-123',
      });

      // Facts should now include stable IDs for diff-based updates
      const savedFacts = updateCall.data.notableFacts;
      expect(savedFacts).toHaveLength(2);
      expect(savedFacts[0]).toMatchObject({ category: 'People', fact: 'User has a daughter named Emma' });
      expect(savedFacts[0].id).toBeDefined();
      expect(savedFacts[0].id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(savedFacts[1]).toMatchObject({ category: 'Logistics', fact: 'Partner works night shifts' });
      expect(savedFacts[1].id).toBeDefined();
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

// ============================================================================
// Diff-Based Fact Reconciliation Tests
// ============================================================================

describe('ensureFactIds', () => {
  it('assigns UUIDs to facts without IDs', () => {
    const legacyFacts = [
      { category: 'People', fact: 'User has a daughter' },
      { category: 'Logistics', fact: 'Lives in NYC' },
    ];

    const result = ensureFactIds(legacyFacts);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBeDefined();
    expect(result[0].id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    expect(result[0].category).toBe('People');
    expect(result[0].fact).toBe('User has a daughter');
    expect(result[1].id).toBeDefined();
    expect(result[1].id).not.toBe(result[0].id); // Each gets unique ID
  });

  it('preserves existing IDs on facts that already have them', () => {
    const factsWithIds: CategorizedFactWithId[] = [
      { id: 'existing-id-1', category: 'People', fact: 'User has a daughter' },
      { id: 'existing-id-2', category: 'Logistics', fact: 'Lives in NYC' },
    ];

    const result = ensureFactIds(factsWithIds);

    expect(result[0].id).toBe('existing-id-1');
    expect(result[1].id).toBe('existing-id-2');
  });

  it('handles mixed facts (some with IDs, some without)', () => {
    const mixedFacts = [
      { id: 'existing-id', category: 'People', fact: 'User has a daughter' },
      { category: 'Logistics', fact: 'Lives in NYC' }, // No ID
    ];

    const result = ensureFactIds(mixedFacts as CategorizedFactWithId[]);

    expect(result[0].id).toBe('existing-id');
    expect(result[1].id).toBeDefined();
    expect(result[1].id).not.toBe('existing-id');
  });

  it('returns empty array for null/undefined input', () => {
    expect(ensureFactIds(null as unknown as CategorizedFactWithId[])).toEqual([]);
    expect(ensureFactIds(undefined as unknown as CategorizedFactWithId[])).toEqual([]);
  });
});

describe('applyFactUpdates', () => {
  const existingFacts: CategorizedFactWithId[] = [
    { id: 'fact-1', category: 'People', fact: 'User has a daughter named Emma' },
    { id: 'fact-2', category: 'Logistics', fact: 'Lives in NYC' },
    { id: 'fact-3', category: 'Emotional', fact: 'Feeling stressed' },
  ];

  it('adds new facts (upsert without ID assigns UUID)', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [
        { category: 'History', fact: 'Married for 10 years' }, // New fact, no ID
      ],
      delete: [],
    };

    const result = applyFactUpdates(existingFacts, llmOutput);

    expect(result).toHaveLength(4);
    // Original facts preserved
    expect(result.find((f) => f.id === 'fact-1')).toBeDefined();
    expect(result.find((f) => f.id === 'fact-2')).toBeDefined();
    expect(result.find((f) => f.id === 'fact-3')).toBeDefined();
    // New fact added with generated ID
    const newFact = result.find((f) => f.fact === 'Married for 10 years');
    expect(newFact).toBeDefined();
    expect(newFact?.id).toBeDefined();
    expect(newFact?.id).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('updates existing facts (upsert with matching ID)', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [
        { id: 'fact-1', category: 'People', fact: 'User has a daughter named Emma who is 14' },
      ],
      delete: [],
    };

    const result = applyFactUpdates(existingFacts, llmOutput);

    expect(result).toHaveLength(3);
    const updatedFact = result.find((f) => f.id === 'fact-1');
    expect(updatedFact?.fact).toBe('User has a daughter named Emma who is 14');
    expect(updatedFact?.category).toBe('People');
  });

  it('deletes facts by ID', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [],
      delete: ['fact-2', 'fact-3'],
    };

    const result = applyFactUpdates(existingFacts, llmOutput);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('fact-1');
  });

  it('handles combined add, update, and delete in single operation', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [
        { id: 'fact-1', category: 'People', fact: 'UPDATED: User has a daughter' },
        { category: 'History', fact: 'NEW: Married for 10 years' },
      ],
      delete: ['fact-2'],
    };

    const result = applyFactUpdates(existingFacts, llmOutput);

    expect(result).toHaveLength(3); // 3 original - 1 deleted + 1 new = 3
    // Updated fact
    expect(result.find((f) => f.id === 'fact-1')?.fact).toBe('UPDATED: User has a daughter');
    // Deleted fact gone
    expect(result.find((f) => f.id === 'fact-2')).toBeUndefined();
    // Preserved fact
    expect(result.find((f) => f.id === 'fact-3')).toBeDefined();
    // New fact added
    expect(result.find((f) => f.fact === 'NEW: Married for 10 years')).toBeDefined();
  });

  it('preserves all facts when LLM returns empty upsert/delete', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [],
      delete: [],
    };

    const result = applyFactUpdates(existingFacts, llmOutput);

    expect(result).toHaveLength(3);
    expect(result).toEqual(existingFacts);
  });

  it('handles empty existing facts with new additions', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [
        { category: 'People', fact: 'First fact ever' },
      ],
      delete: [],
    };

    const result = applyFactUpdates([], llmOutput);

    expect(result).toHaveLength(1);
    expect(result[0].fact).toBe('First fact ever');
    expect(result[0].id).toBeDefined();
  });

  it('ignores delete requests for non-existent IDs', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [],
      delete: ['non-existent-id', 'another-fake-id'],
    };

    const result = applyFactUpdates(existingFacts, llmOutput);

    expect(result).toHaveLength(3); // All preserved
  });

  it('enforces soft limit of 20 facts after reconciliation', () => {
    const manyExistingFacts: CategorizedFactWithId[] = Array.from({ length: 18 }, (_, i) => ({
      id: `fact-${i}`,
      category: 'People',
      fact: `Existing fact ${i}`,
    }));

    const llmOutput: FactUpdatePayload = {
      upsert: [
        { category: 'New', fact: 'New fact 1' },
        { category: 'New', fact: 'New fact 2' },
        { category: 'New', fact: 'New fact 3' },
        { category: 'New', fact: 'New fact 4' },
      ],
      delete: [],
    };

    const result = applyFactUpdates(manyExistingFacts, llmOutput);

    expect(result).toHaveLength(20); // Capped at 20
  });

  it('filters invalid upsert entries (empty fact or category)', () => {
    const llmOutput: FactUpdatePayload = {
      upsert: [
        { category: 'People', fact: 'Valid fact' },
        { category: '', fact: 'Empty category' },
        { category: 'Emotional', fact: '' },
        { category: 'History', fact: 'Another valid fact' },
      ],
      delete: [],
    };

    const result = applyFactUpdates([], llmOutput);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.fact)).toEqual(['Valid fact', 'Another valid fact']);
  });

  it('handles null/undefined llmOutput gracefully (preserves existing)', () => {
    const result1 = applyFactUpdates(existingFacts, null as unknown as FactUpdatePayload);
    const result2 = applyFactUpdates(existingFacts, undefined as unknown as FactUpdatePayload);

    expect(result1).toEqual(existingFacts);
    expect(result2).toEqual(existingFacts);
  });
});

// ============================================================================
// Diff-Based Prompt and Response Parsing Tests
// ============================================================================

describe('Diff-Based Classifier Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes random short IDs (not full UUIDs) in prompt when existing facts have IDs', async () => {
    const existingFactsWithIds: CategorizedFactWithId[] = [
      { id: 'fact-abc-123', category: 'People', fact: 'User has a daughter' },
      { id: 'fact-def-456', category: 'Logistics', fact: 'Lives in NYC' },
    ];

    // Mock response - we'll extract the actual short IDs from the prompt
    (getHaikuJson as jest.Mock).mockResolvedValueOnce({
      topicContext: 'discussing family',
      upsert: [],
      delete: [],
    });

    await runPartnerSessionClassifier({
      userMessage: 'Her name is Emma',
      conversationHistory: [],
      sessionId: 'session-123',
      userId: 'user-456',
      turnId: 'turn-1',
      existingFactsWithIds,
    });

    // Verify the prompt uses short IDs (not full UUIDs) for token efficiency
    const call = (getHaikuJson as jest.Mock).mock.calls[0][0];
    const promptContent = call.messages[0].content;

    // Full UUIDs should NOT be in the prompt
    expect(promptContent).not.toContain('fact-abc-123');
    expect(promptContent).not.toContain('fact-def-456');

    // Short IDs (5 char alphanumeric) should be present
    // Pattern: [xxxxx] where x is alphanumeric
    const shortIdPattern = /\[([a-z0-9]{5})\]/g;
    const matches = promptContent.match(shortIdPattern);
    expect(matches).toHaveLength(2); // Two facts = two short IDs

    // Verify structural elements
    expect(promptContent).toContain('upsert');
    expect(promptContent).toContain('delete');
    expect(promptContent).toContain('Copy the exact 5-character ID');
  });

  it('uses diff-based reconciliation with short ID mapping', async () => {
    const existingFactsWithIds: CategorizedFactWithId[] = [
      { id: 'fact-1', category: 'People', fact: 'User has a daughter' },
      { id: 'fact-2', category: 'Logistics', fact: 'Lives in NYC' },
      { id: 'fact-3', category: 'Emotional', fact: 'Feeling stressed' },
    ];

    // First, we need to capture the short IDs that will be generated
    // We do this by spying on the call and extracting from the prompt
    let capturedShortIds: { [fullId: string]: string } = {};

    (getHaikuJson as jest.Mock).mockImplementationOnce((args) => {
      // Extract short IDs from the prompt
      const prompt = args.messages[0].content;
      const lines = prompt.split('\n').filter((l: string) => l.includes('[') && l.includes(']'));
      lines.forEach((line: string) => {
        const match = line.match(/\[([a-z0-9]{5})\]\s*(\w+):/);
        if (match) {
          // Map category to find full ID
          const shortId = match[1];
          const category = match[2];
          const fact = existingFactsWithIds.find(f => f.category === category);
          if (fact) {
            capturedShortIds[fact.id] = shortId;
          }
        }
      });

      // Return diff using the captured short IDs
      return Promise.resolve({
        topicContext: 'discussing family stress',
        upsert: [
          { id: capturedShortIds['fact-1'], category: 'People', fact: 'User has a daughter named Emma who is 14' },
          { category: 'History', fact: 'Been married for 10 years' }, // New fact, no ID
        ],
        delete: [capturedShortIds['fact-3']], // Delete fact-3 using its short ID
      });
    });

    await runPartnerSessionClassifier({
      userMessage: 'Actually feeling better now',
      conversationHistory: [],
      sessionId: 'session-123',
      userId: 'user-456',
      turnId: 'turn-1',
      existingFactsWithIds,
    });

    // Verify the saved facts are correctly reconciled with full UUIDs preserved
    expect(prisma.userVessel.updateMany).toHaveBeenCalled();
    const updateCall = (prisma.userVessel.updateMany as jest.Mock).mock.calls[0][0];
    const savedFacts = updateCall.data.notableFacts as CategorizedFactWithId[];

    // fact-1 updated, fact-2 preserved, fact-3 deleted, new fact added
    expect(savedFacts).toHaveLength(3);
    // Verify full UUID is preserved after short ID resolution
    expect(savedFacts.find((f: CategorizedFactWithId) => f.id === 'fact-1')?.fact).toBe(
      'User has a daughter named Emma who is 14'
    );
    expect(savedFacts.find((f: CategorizedFactWithId) => f.id === 'fact-2')).toBeDefined();
    expect(savedFacts.find((f: CategorizedFactWithId) => f.id === 'fact-3')).toBeUndefined();
    expect(savedFacts.find((f: CategorizedFactWithId) => f.fact === 'Been married for 10 years')).toBeDefined();
  });

  it('preserves all facts when LLM returns empty upsert/delete', async () => {
    const existingFactsWithIds: CategorizedFactWithId[] = [
      { id: 'fact-1', category: 'People', fact: 'User has a daughter' },
      { id: 'fact-2', category: 'Logistics', fact: 'Lives in NYC' },
    ];

    (getHaikuJson as jest.Mock).mockResolvedValueOnce({
      topicContext: 'no changes',
      upsert: [],
      delete: [],
    });

    await runPartnerSessionClassifier({
      userMessage: 'Just saying hi',
      conversationHistory: [],
      sessionId: 'session-123',
      userId: 'user-456',
      turnId: 'turn-1',
      existingFactsWithIds,
    });

    const updateCall = (prisma.userVessel.updateMany as jest.Mock).mock.calls[0][0];
    const savedFacts = updateCall.data.notableFacts as CategorizedFactWithId[];

    expect(savedFacts).toHaveLength(2);
    expect(savedFacts).toEqual(existingFactsWithIds);
  });

  it('falls back gracefully when LLM returns old format (full list without upsert/delete)', async () => {
    const existingFactsWithIds: CategorizedFactWithId[] = [
      { id: 'fact-1', category: 'People', fact: 'User has a daughter' },
    ];

    // LLM returns OLD format (full list) - backward compatibility
    (getHaikuJson as jest.Mock).mockResolvedValueOnce({
      topicContext: 'old format response',
      notableFacts: [
        { category: 'People', fact: 'User has a daughter named Emma' },
        { category: 'Logistics', fact: 'New fact from old format' },
      ],
    });

    const result = await runPartnerSessionClassifier({
      userMessage: 'Testing backward compat',
      conversationHistory: [],
      sessionId: 'session-123',
      userId: 'user-456',
      turnId: 'turn-1',
      existingFactsWithIds,
    });

    // When old format is detected, we should still save the facts
    // (fallback behavior - full replacement as before)
    expect(result?.notableFacts).toBeDefined();
    expect(result?.notableFacts).toHaveLength(2);
  });

  it('assigns IDs to legacy facts from DB that lack them before sending to LLM', async () => {
    // Simulate legacy facts from DB without IDs
    const legacyFacts = [
      { category: 'People', fact: 'Legacy fact without ID' },
    ];

    (getHaikuJson as jest.Mock).mockResolvedValueOnce({
      topicContext: 'test',
      upsert: [],
      delete: [],
    });

    await runPartnerSessionClassifier({
      userMessage: 'Test message',
      conversationHistory: [],
      sessionId: 'session-123',
      userId: 'user-456',
      turnId: 'turn-1',
      existingFacts: legacyFacts.map((f) => `[${f.category}] ${f.fact}`),
    });

    // The prompt should contain the legacy fact (as string for backward compat)
    const call = (getHaikuJson as jest.Mock).mock.calls[0][0];
    expect(call.messages[0].content).toContain('Legacy fact without ID');
  });
});
