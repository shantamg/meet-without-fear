/**
 * Distillation Service Unit Tests
 *
 * Tests for:
 * - distillSession: main orchestration function
 * - buildDistillationPrompt: message formatting
 * - normalizeTakeaways: defensive Haiku output normalization
 */

import { prisma } from '../../lib/prisma';

// Mock prisma
jest.mock('../../lib/prisma');

// Mock bedrock
jest.mock('../../lib/bedrock', () => ({
  getHaikuJson: jest.fn(),
  BrainActivityCallType: {
    DISTILLATION: 'DISTILLATION',
  },
}));

// Mock circuit-breaker — pass-through (calls the fn directly)
jest.mock('../../utils/circuit-breaker', () => ({
  withHaikuCircuitBreaker: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { getHaikuJson } from '../../lib/bedrock';
import { withHaikuCircuitBreaker } from '../../utils/circuit-breaker';
import { distillSession, buildDistillationPrompt, normalizeTakeaways } from '../distillation';

const mockGetHaikuJson = getHaikuJson as jest.MockedFunction<typeof getHaikuJson>;
const mockWithHaikuCircuitBreaker = withHaikuCircuitBreaker as jest.MockedFunction<typeof withHaikuCircuitBreaker>;

// Accessor for sessionTakeaway — not yet in Prisma generated types (migration pending)
// The mock is registered in __mocks__/prisma.ts under sessionTakeaway.
const mockST = () => (prisma as any).sessionTakeaway as {
  findMany: jest.Mock;
  deleteMany: jest.Mock;
  createMany: jest.Mock;
};

// ============================================================================
// Helpers
// ============================================================================

function makeMessage(role: 'USER' | 'AI', content: string, index = 0) {
  return {
    id: `msg-${index}`,
    sessionId: 'session-1',
    role,
    content,
    timestamp: new Date(Date.now() + index * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTakeaway(source: 'AI' | 'USER', content: string, position: number) {
  return {
    id: `takeaway-${position}`,
    sessionId: 'session-1',
    content,
    theme: null,
    source,
    position,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================================
// normalizeTakeaways
// ============================================================================

describe('normalizeTakeaways', () => {
  it('handles { takeaways: [...] } shape (primary)', () => {
    const raw = { takeaways: [{ content: 'I need space' }, { content: 'I felt unheard' }] };
    const result = normalizeTakeaways(raw);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('I need space');
  });

  it('handles top-level array fallback', () => {
    const raw = [{ content: 'I was exhausted' }, { content: 'I needed support' }];
    const result = normalizeTakeaways(raw);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('I was exhausted');
  });

  it('returns empty array for null', () => {
    expect(normalizeTakeaways(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(normalizeTakeaways(undefined)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeTakeaways({})).toEqual([]);
    expect(normalizeTakeaways([])).toEqual([]);
  });

  it('filters out items without a content string', () => {
    const raw = { takeaways: [{ content: 'Valid' }, { theme: 'only-theme' }, null, { content: 42 }] };
    const result = normalizeTakeaways(raw);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Valid');
  });

  it('caps at 10 takeaways (hard limit)', () => {
    const raw = {
      takeaways: Array.from({ length: 15 }, (_, i) => ({ content: `Takeaway ${i + 1}` })),
    };
    const result = normalizeTakeaways(raw);
    expect(result).toHaveLength(10);
  });
});

// ============================================================================
// buildDistillationPrompt
// ============================================================================

describe('buildDistillationPrompt', () => {
  it('formats AI messages as "Journal Guide"', () => {
    const messages = [
      { role: 'AI', content: 'How are you feeling?' },
    ];
    const prompt = buildDistillationPrompt(messages);
    expect(prompt).toContain('Journal Guide');
    expect(prompt).toContain('How are you feeling?');
  });

  it('formats USER messages as "Me"', () => {
    const messages = [
      { role: 'USER', content: 'I felt really ignored today' },
    ];
    const prompt = buildDistillationPrompt(messages);
    expect(prompt).toContain('Me');
    expect(prompt).toContain('I felt really ignored today');
  });

  it('includes the rule about using the person\'s own words', () => {
    const messages = [{ role: 'USER', content: 'test' }];
    const prompt = buildDistillationPrompt(messages);
    expect(prompt.toLowerCase()).toMatch(/own words|verbatim/);
  });

  it('includes JSON output format instruction', () => {
    const messages = [{ role: 'USER', content: 'test' }];
    const prompt = buildDistillationPrompt(messages);
    expect(prompt).toContain('"takeaways"');
  });
});

// ============================================================================
// distillSession
// ============================================================================

describe('distillSession', () => {
  const sessionId = 'session-1';
  const userId = 'user-1';
  const turnId = 'turn-1';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: circuit breaker passes through
    mockWithHaikuCircuitBreaker.mockImplementation(async (fn) => fn());

    // Default: session update returns basic session
    (prisma.innerWorkSession.update as jest.Mock).mockResolvedValue({
      id: sessionId,
      distilledAt: new Date(),
    });
  });

  it('returns empty array and skips Haiku when session has fewer than 2 user messages', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('AI', 'What brings you here today?', 0),
      makeMessage('USER', 'Just one message', 1),
    ]);
    mockST().findMany.mockResolvedValue([]);

    const result = await distillSession({ sessionId, userId, turnId });

    expect(mockGetHaikuJson).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('calls getHaikuJson with correct callType and prompt structure', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('AI', 'How are you feeling?', 0),
      makeMessage('USER', 'I felt really unheard today', 1),
      makeMessage('AI', 'Tell me more', 2),
      makeMessage('USER', 'My partner never listens', 3),
    ]);
    mockGetHaikuJson.mockResolvedValue({ takeaways: [{ content: 'I felt unheard', theme: 'connection' }] });
    mockST().deleteMany.mockResolvedValue({ count: 0 });
    mockST().createMany.mockResolvedValue({ count: 1 });
    mockST().findMany.mockResolvedValue([
      makeTakeaway('AI', 'I felt unheard', 0),
    ]);

    await distillSession({ sessionId, userId, turnId });

    expect(mockGetHaikuJson).toHaveBeenCalledWith(
      expect.objectContaining({
        callType: 'DISTILLATION',
        operation: 'distillation',
        innerWorkSessionId: sessionId,
        turnId,
        maxTokens: 1024,
      })
    );
  });

  it('normalizes Haiku response with { takeaways: [...] } shape', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('USER', 'Message 1', 0),
      makeMessage('USER', 'Message 2', 1),
    ]);
    mockGetHaikuJson.mockResolvedValue({
      takeaways: [
        { content: 'I need more space', theme: 'needs' },
        { content: 'I felt unheard' },
      ],
    });
    mockST().deleteMany.mockResolvedValue({ count: 0 });
    mockST().createMany.mockResolvedValue({ count: 2 });
    mockST().findMany.mockResolvedValue([
      makeTakeaway('AI', 'I need more space', 0),
      makeTakeaway('AI', 'I felt unheard', 1),
    ]);

    const result = await distillSession({ sessionId, userId, turnId });

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('I need more space');
  });

  it('normalizes Haiku response when raw result is a top-level array', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('USER', 'Message 1', 0),
      makeMessage('USER', 'Message 2', 1),
    ]);
    // Haiku returns array directly instead of { takeaways: [] }
    mockGetHaikuJson.mockResolvedValue([
      { content: 'I felt overwhelmed' },
    ] as unknown as ReturnType<typeof mockGetHaikuJson>);
    mockST().deleteMany.mockResolvedValue({ count: 0 });
    mockST().createMany.mockResolvedValue({ count: 1 });
    mockST().findMany.mockResolvedValue([
      makeTakeaway('AI', 'I felt overwhelmed', 0),
    ]);

    const result = await distillSession({ sessionId, userId, turnId });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('I felt overwhelmed');
  });

  it('returns empty array when Haiku returns null (circuit breaker fallback)', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('USER', 'Message 1', 0),
      makeMessage('USER', 'Message 2', 1),
    ]);
    mockGetHaikuJson.mockResolvedValue(null);
    mockST().findMany.mockResolvedValue([]);

    const result = await distillSession({ sessionId, userId, turnId });

    expect(result).toEqual([]);
  });

  it('deletes existing AI-origin takeaways before writing new ones (re-distillation)', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('USER', 'Message 1', 0),
      makeMessage('USER', 'Message 2', 1),
    ]);
    mockGetHaikuJson.mockResolvedValue({
      takeaways: [{ content: 'Updated takeaway' }],
    });
    mockST().deleteMany.mockResolvedValue({ count: 2 });
    mockST().createMany.mockResolvedValue({ count: 1 });
    mockST().findMany.mockResolvedValue([
      makeTakeaway('AI', 'Updated takeaway', 0),
    ]);

    await distillSession({ sessionId, userId, turnId });

    expect(mockST().deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId,
          source: 'AI',
        }),
      })
    );
  });

  it('preserves USER-origin takeaways during re-distillation', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('USER', 'Message 1', 0),
      makeMessage('USER', 'Message 2', 1),
    ]);
    mockGetHaikuJson.mockResolvedValue({
      takeaways: [{ content: 'New AI takeaway' }],
    });
    mockST().deleteMany.mockResolvedValue({ count: 1 });
    mockST().createMany.mockResolvedValue({ count: 1 });

    // Return both AI and USER takeaways after transaction
    const userTakeaway = makeTakeaway('USER', 'My own insight', 1);
    const aiTakeaway = makeTakeaway('AI', 'New AI takeaway', 0);
    mockST().findMany.mockResolvedValue([aiTakeaway, userTakeaway]);

    const result = await distillSession({ sessionId, userId, turnId });

    // deleteMany only targets AI source — USER takeaways not deleted
    expect(mockST().deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'AI' }),
      })
    );
    // Result includes the USER takeaway
    expect(result.some(t => t.source === 'USER')).toBe(true);
  });

  it('updates distilledAt on the session', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('USER', 'Message 1', 0),
      makeMessage('USER', 'Message 2', 1),
    ]);
    mockGetHaikuJson.mockResolvedValue({
      takeaways: [{ content: 'Takeaway' }],
    });
    mockST().deleteMany.mockResolvedValue({ count: 0 });
    mockST().createMany.mockResolvedValue({ count: 1 });
    mockST().findMany.mockResolvedValue([]);

    await distillSession({ sessionId, userId, turnId });

    expect(prisma.innerWorkSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sessionId },
        data: expect.objectContaining({
          distilledAt: expect.any(Date),
        }),
      })
    );
  });

  it('caps takeaways at 10 (hard limit)', async () => {
    (prisma.innerWorkMessage.findMany as jest.Mock).mockResolvedValue([
      makeMessage('USER', 'Message 1', 0),
      makeMessage('USER', 'Message 2', 1),
    ]);
    const manyTakeaways = Array.from({ length: 15 }, (_, i) => ({ content: `Takeaway ${i + 1}` }));
    mockGetHaikuJson.mockResolvedValue({ takeaways: manyTakeaways });
    mockST().deleteMany.mockResolvedValue({ count: 0 });
    mockST().createMany.mockResolvedValue({ count: 10 });
    mockST().findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => makeTakeaway('AI', `Takeaway ${i + 1}`, i))
    );

    const result = await distillSession({ sessionId, userId, turnId });

    // createMany should be called with at most 10 items
    const createManyCall = mockST().createMany.mock.calls[0][0];
    expect(createManyCall.data.length).toBeLessThanOrEqual(10);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
