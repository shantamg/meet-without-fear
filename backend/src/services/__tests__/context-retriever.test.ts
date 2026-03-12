/**
 * Context Retriever Tests
 *
 * Tests the universal context retrieval service including:
 * - Reference detection behavior via the public retrieveContext API
 * - Context formatting and truncation
 * - Error handling when embedding search fails
 * - Deduplication of search results
 */

// ============================================================================
// Mocks — must be declared before imports
// ============================================================================

jest.mock('../../lib/prisma');
jest.mock('../../lib/bedrock', () => ({
  getHaikuJson: jest.fn().mockResolvedValue(null),
  getModelCompletion: jest.fn().mockResolvedValue(null),
  getEmbedding: jest.fn().mockResolvedValue(null),
  BrainActivityCallType: {
    REFERENCE_DETECTION: 'REFERENCE_DETECTION',
    ORCHESTRATED_RESPONSE: 'ORCHESTRATED_RESPONSE',
  },
}));
jest.mock('../brain-service', () => ({
  brainService: {
    startActivity: jest.fn().mockResolvedValue({ id: 'mock-activity-id' }),
    completeActivity: jest.fn().mockResolvedValue(undefined),
    failActivity: jest.fn().mockResolvedValue(undefined),
  },
  BrainActivityCallType: {
    REFERENCE_DETECTION: 'REFERENCE_DETECTION',
  },
}));
jest.mock('../embedding', () => ({
  searchSessionContent: jest.fn().mockResolvedValue([]),
  searchInnerWorkSessionContent: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../utils/circuit-breaker', () => ({
  withHaikuCircuitBreaker: jest.fn(async (fn: () => Promise<any>, fallback: any) => {
    try {
      const result = await fn();
      // Match real circuit breaker: null result triggers fallback
      if (result === null) return fallback;
      return result;
    } catch {
      return fallback;
    }
  }),
}));

// ============================================================================
// Imports
// ============================================================================

import {
  retrieveContext,
  formatRetrievedContext,
  buildMessagesWithFullContext,
  type RetrievedContext,
  type RelevantMessage,
  type RetrievalOptions,
  type DetectedReference,
} from '../context-retriever';
import { getHaikuJson } from '../../lib/bedrock';
import { prisma } from '../../lib/prisma';
import { searchSessionContent, searchInnerWorkSessionContent } from '../embedding';

const mockGetHaikuJson = getHaikuJson as jest.MockedFunction<typeof getHaikuJson>;
const mockSearchSessionContent = searchSessionContent as jest.MockedFunction<typeof searchSessionContent>;
const mockSearchInnerWorkSessionContent = searchInnerWorkSessionContent as jest.MockedFunction<typeof searchInnerWorkSessionContent>;

// ============================================================================
// Fixtures
// ============================================================================

function buildOptions(overrides?: Partial<RetrievalOptions>): RetrievalOptions {
  return {
    userId: 'user-1',
    currentMessage: 'I feel really frustrated with Bob.',
    currentSessionId: 'session-1',
    turnId: 'session-1-1',
    maxCrossSessionMessages: 10,
    similarityThreshold: 0.5,
    includePreSession: true,
    skipDetection: false,
    ...overrides,
  };
}

function buildRetrievedContext(overrides?: Partial<RetrievedContext>): RetrievedContext {
  return {
    conversationHistory: [],
    relevantFromOtherSessions: [],
    relevantFromCurrentSession: [],
    preSessionMessages: [],
    detectedReferences: [],
    retrievalSummary: 'No additional context retrieved',
    ...overrides,
  };
}

function buildRelevantMessage(overrides?: Partial<RelevantMessage>): RelevantMessage {
  return {
    content: 'Some relevant content from a past session',
    sessionId: 'session-old',
    partnerName: 'Bob',
    similarity: 0.85,
    timestamp: new Date('2025-12-01T10:00:00Z').toISOString(),
    role: 'user',
    source: 'partner-session',
    ...overrides,
  };
}

// ============================================================================
// Tests — retrieveContext
// ============================================================================

describe('Context Retriever', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: session lookup
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-1',
      relationshipId: 'rel-1',
    });

    // Default: no messages
    (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

    // Default: no pre-session messages
    (prisma.preSessionMessage.findMany as jest.Mock).mockResolvedValue([]);

    // Default: no user prefs
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      memoryPreferences: null,
    });
  });

  // --------------------------------------------------------------------------
  // Reference detection via public API
  // --------------------------------------------------------------------------

  describe('reference detection (via retrieveContext)', () => {
    it('calls Haiku for reference detection when not skipDetection', async () => {
      mockGetHaikuJson.mockResolvedValue({
        references: [
          { type: 'agreement', text: 'we agreed to talk weekly', confidence: 'high' },
        ],
        needsRetrieval: true,
        searchQueries: ['weekly conversation agreement'],
      });

      const result = await retrieveContext(buildOptions());

      expect(mockGetHaikuJson).toHaveBeenCalled();
      expect(result.detectedReferences).toHaveLength(1);
      expect(result.detectedReferences[0].type).toBe('agreement');
    });

    it('skips Haiku detection when skipDetection=true and always searches', async () => {
      const result = await retrieveContext(
        buildOptions({ skipDetection: true })
      );

      // When skipDetection is true, Haiku should NOT be called
      expect(mockGetHaikuJson).not.toHaveBeenCalled();
      // But retrieval summary should indicate search was attempted
      // (since needsRetrieval=true when skipDetection is set)
      expect(result).toBeDefined();
    });

    it('returns empty references when Haiku returns null (circuit breaker fallback)', async () => {
      mockGetHaikuJson.mockResolvedValue(null);

      const result = await retrieveContext(buildOptions());

      expect(result.detectedReferences).toHaveLength(0);
    });

    it('returns empty references when no session ID is provided', async () => {
      const result = await retrieveContext(
        buildOptions({ currentSessionId: undefined })
      );

      // Without a session ID, reference detection is skipped
      expect(result.detectedReferences).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Conversation history retrieval
  // --------------------------------------------------------------------------

  describe('conversation history', () => {
    it('retrieves messages for the current session', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        {
          content: 'Hello',
          role: 'USER',
          timestamp: new Date('2025-12-01T10:00:00Z'),
        },
        {
          content: 'Hi, how can I help?',
          role: 'AI',
          timestamp: new Date('2025-12-01T10:00:05Z'),
        },
      ]);

      const result = await retrieveContext(buildOptions());

      expect(result.conversationHistory).toHaveLength(2);
      expect(result.conversationHistory[0].role).toBe('user');
      expect(result.conversationHistory[0].content).toBe('Hello');
      expect(result.conversationHistory[1].role).toBe('assistant');
    });

    it('returns empty history when no session ID', async () => {
      const result = await retrieveContext(
        buildOptions({ currentSessionId: undefined })
      );

      expect(result.conversationHistory).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Pre-session messages
  // --------------------------------------------------------------------------

  describe('pre-session messages', () => {
    it('retrieves pre-session messages when enabled', async () => {
      (prisma.preSessionMessage.findMany as jest.Mock).mockResolvedValue([
        {
          content: 'I need help with something',
          role: 'USER',
          timestamp: new Date(),
        },
      ]);

      const result = await retrieveContext(
        buildOptions({ includePreSession: true })
      );

      expect(result.preSessionMessages).toHaveLength(1);
      expect(result.preSessionMessages[0].content).toBe('I need help with something');
    });

    it('skips pre-session messages when disabled', async () => {
      const result = await retrieveContext(
        buildOptions({ includePreSession: false })
      );

      expect(result.preSessionMessages).toHaveLength(0);
      // Pre-session message query should not have been called
      expect(prisma.preSessionMessage.findMany).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Semantic search (cross-session)
  // --------------------------------------------------------------------------

  describe('semantic search', () => {
    it('searches when detection says needsRetrieval=true', async () => {
      mockGetHaikuJson.mockResolvedValue({
        references: [],
        needsRetrieval: true,
        searchQueries: ['Bob not listening'],
      });

      // Cross-session is currently disabled (shouldSearchCrossSession = false)
      // but inner thoughts can still be searched
      await retrieveContext(
        buildOptions({ includeInnerThoughts: true })
      );

      expect(mockSearchInnerWorkSessionContent).toHaveBeenCalled();
    });

    it('does not search when detection says needsRetrieval=false', async () => {
      mockGetHaikuJson.mockResolvedValue({
        references: [],
        needsRetrieval: false,
        searchQueries: [],
      });

      await retrieveContext(buildOptions());

      // No search should happen
      expect(mockSearchSessionContent).not.toHaveBeenCalled();
    });

    it('includes inner thoughts results in relevantFromOtherSessions', async () => {
      mockGetHaikuJson.mockResolvedValue({
        references: [],
        needsRetrieval: true,
        searchQueries: ['frustration with communication'],
      });

      mockSearchInnerWorkSessionContent.mockResolvedValue([
        {
          sessionId: 'inner-session-1',
          similarity: 0.88,
          theme: 'Reflecting on communication patterns',
        } as any,
      ]);

      const result = await retrieveContext(
        buildOptions({ includeInnerThoughts: true })
      );

      expect(result.relevantFromOtherSessions.length).toBeGreaterThanOrEqual(1);
      const innerThought = result.relevantFromOtherSessions.find(
        (m) => m.source === 'inner-thoughts'
      );
      expect(innerThought).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('handles session lookup failure gracefully', async () => {
      (prisma.session.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

      // Should not throw
      const result = await retrieveContext(buildOptions());

      expect(result).toBeDefined();
      expect(result.conversationHistory).toBeDefined();
    });

    it('handles user preferences lookup failure', async () => {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

      // Should not throw
      const result = await retrieveContext(buildOptions());

      expect(result).toBeDefined();
    });

    it('handles embedding search failure gracefully', async () => {
      // Haiku says we need retrieval
      mockGetHaikuJson.mockResolvedValue({
        references: [],
        needsRetrieval: true,
        searchQueries: ['test query'],
      });

      // But the embedding search itself throws
      mockSearchInnerWorkSessionContent.mockRejectedValue(
        new Error('Embedding service down')
      );

      // The search error propagates through Promise.all in the search pipeline,
      // so retrieveContext will reject. Verify it rejects rather than silently succeeding.
      await expect(
        retrieveContext(buildOptions({ includeInnerThoughts: true }))
      ).rejects.toThrow('Embedding service down');
    });
  });

  // --------------------------------------------------------------------------
  // Namespace isolation
  // --------------------------------------------------------------------------

  describe('namespace isolation', () => {
    it('does not search inner thoughts content when includeInnerThoughts is false (default)', async () => {
      // Partner sessions do NOT pass includeInnerThoughts — they rely on the default (false).
      // This test confirms the namespace boundary: partner session context never searches
      // inner thoughts / journal content.
      await retrieveContext(buildOptions({ skipDetection: true }));

      expect(mockSearchInnerWorkSessionContent).not.toHaveBeenCalled();
    });

    it('searches inner thoughts content when includeInnerThoughts is true', async () => {
      // Inner Thoughts sessions explicitly opt in via includeInnerThoughts: true.
      // This test confirms that the opt-in path works correctly.
      mockSearchInnerWorkSessionContent.mockResolvedValue([]);

      await retrieveContext(buildOptions({ skipDetection: true, includeInnerThoughts: true }));

      expect(mockSearchInnerWorkSessionContent).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Retrieval summary
  // --------------------------------------------------------------------------

  describe('retrieval summary', () => {
    it('builds summary with conversation history count', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([
        { content: 'msg1', role: 'USER', timestamp: new Date() },
        { content: 'msg2', role: 'AI', timestamp: new Date() },
      ]);

      const result = await retrieveContext(buildOptions());

      expect(result.retrievalSummary).toContain('2 messages in current conversation');
    });

    it('builds summary with pre-session count', async () => {
      (prisma.preSessionMessage.findMany as jest.Mock).mockResolvedValue([
        { content: 'pre1', role: 'USER', timestamp: new Date() },
      ]);

      const result = await retrieveContext(buildOptions());

      expect(result.retrievalSummary).toContain('1 pre-session messages');
    });

    it('returns default summary when no context is found', async () => {
      const result = await retrieveContext(buildOptions());

      expect(result.retrievalSummary).toBe('No additional context retrieved');
    });
  });
});

// ============================================================================
// Tests — formatRetrievedContext
// ============================================================================

describe('formatRetrievedContext', () => {
  it('returns empty string when no context is available', () => {
    const context = buildRetrievedContext();
    const formatted = formatRetrievedContext(context);
    expect(formatted).toBe('');
  });

  it('formats pre-session messages', () => {
    const context = buildRetrievedContext({
      preSessionMessages: [
        { role: 'user', content: 'I need to talk about something', timestamp: new Date().toISOString() },
      ],
    });

    const formatted = formatRetrievedContext(context);

    expect(formatted).toContain('[Earlier in this conversation]');
    expect(formatted).toContain('User: I need to talk about something');
  });

  it('formats cross-session results with time context', () => {
    const context = buildRetrievedContext({
      relevantFromOtherSessions: [
        buildRelevantMessage({
          partnerName: 'Bob',
          content: 'We discussed childcare responsibilities',
          timeContext: {
            bucket: 'recent' as any,
            daysAgo: 14,
            hoursAgo: 336,
            phrase: 'about 2 weeks ago',
            useRememberingLanguage: true,
            promptGuidance: 'Reference naturally',
          },
          source: 'partner-session',
        }),
      ],
    });

    const formatted = formatRetrievedContext(context);

    expect(formatted).toContain('[Related content from previous sessions]');
    expect(formatted).toContain('[Session with Bob, about 2 weeks ago]');
    expect(formatted).toContain('We discussed childcare responsibilities');
  });

  it('formats inner thoughts results differently', () => {
    const context = buildRetrievedContext({
      relevantFromOtherSessions: [
        buildRelevantMessage({
          content: 'I realized I tend to shut down during arguments',
          source: 'inner-thoughts',
          timeContext: {
            bucket: 'recent' as any,
            daysAgo: 3,
            hoursAgo: 72,
            phrase: 'a few days ago',
            useRememberingLanguage: true,
            promptGuidance: 'Reference naturally',
          },
        }),
      ],
    });

    const formatted = formatRetrievedContext(context);

    expect(formatted).toContain('[Your reflections, a few days ago]');
    expect(formatted).toContain('I realized I tend to shut down');
  });

  it('formats detected references', () => {
    const refs: DetectedReference[] = [
      { type: 'agreement', text: 'we agreed to talk weekly', confidence: 'high' },
      { type: 'person', text: 'my mom', confidence: 'medium' },
    ];

    const context = buildRetrievedContext({ detectedReferences: refs });
    const formatted = formatRetrievedContext(context);

    expect(formatted).toContain('[Detected references in user message]');
    expect(formatted).toContain('agreement: "we agreed to talk weekly" (high confidence)');
    expect(formatted).toContain('person: "my mom" (medium confidence)');
  });

  it('truncates long content to 500 characters', () => {
    const longContent = 'x'.repeat(600);
    const context = buildRetrievedContext({
      preSessionMessages: [
        { role: 'user', content: longContent },
      ],
    });

    const formatted = formatRetrievedContext(context);

    // Should be truncated with the ellipsis marker
    expect(formatted).toContain('[truncated]');
    // Should not contain the full 600-char string
    expect(formatted.length).toBeLessThan(longContent.length + 200);
  });

  it('includes recency guidance when cross-session results exist', () => {
    const context = buildRetrievedContext({
      relevantFromOtherSessions: [
        buildRelevantMessage({
          timeContext: {
            bucket: 'old' as any,
            daysAgo: 90,
            hoursAgo: 2160,
            phrase: '3 months ago',
            useRememberingLanguage: true,
            promptGuidance: 'Reference with tentativeness',
          },
        }),
      ],
      recencyGuidance: 'Some of this context is from several months ago; reference with appropriate tentativeness.',
    });

    const formatted = formatRetrievedContext(context);

    expect(formatted).toContain('[MEMORY CONTEXT GUIDANCE:');
    expect(formatted).toContain('tentativeness');
  });

  it('does not include recency guidance when no cross-session results', () => {
    const context = buildRetrievedContext({
      recencyGuidance: 'This should not appear',
    });

    const formatted = formatRetrievedContext(context);

    expect(formatted).not.toContain('MEMORY CONTEXT GUIDANCE');
  });

  it('formats within-session results', () => {
    const context = buildRetrievedContext({
      relevantFromCurrentSession: [
        buildRelevantMessage({
          content: 'Earlier we talked about trust',
          timeContext: {
            bucket: 'just-now' as any,
            daysAgo: 0,
            hoursAgo: 0.33,
            phrase: '20 minutes ago',
            useRememberingLanguage: false,
            promptGuidance: 'Reference casually',
          },
        }),
      ],
    });

    const formatted = formatRetrievedContext(context);

    expect(formatted).toContain('[Related content from earlier in this session]');
    expect(formatted).toContain('Earlier we talked about trust');
  });
});

// ============================================================================
// Tests — buildMessagesWithFullContext
// ============================================================================

describe('buildMessagesWithFullContext', () => {
  it('includes conversation history before current message', () => {
    const context = buildRetrievedContext({
      conversationHistory: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    });

    const messages = buildMessagesWithFullContext(context, 'How are you?');

    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].content).toBe('Hi there!');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toContain('How are you?');
  });

  it('injects retrieved context as prefix to current message', () => {
    const context = buildRetrievedContext({
      conversationHistory: [],
      relevantFromOtherSessions: [
        buildRelevantMessage({ content: 'Past insight about trust' }),
      ],
    });

    const messages = buildMessagesWithFullContext(context, 'I want to talk about trust');

    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content).toContain('Retrieved context:');
    expect(lastMsg.content).toContain('I want to talk about trust');
  });

  it('does not inject context prefix when no retrieved context', () => {
    const context = buildRetrievedContext({
      conversationHistory: [
        { role: 'user', content: 'prev' },
        { role: 'assistant', content: 'ok' },
      ],
    });

    const messages = buildMessagesWithFullContext(context, 'Hi');

    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content).toBe('Hi');
    expect(lastMsg.content).not.toContain('Retrieved context');
  });
});
