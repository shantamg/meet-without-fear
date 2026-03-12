/**
 * Theme Detector Service Unit Tests
 *
 * Tests for:
 * - detectRecurringTheme: cross-session theme detection and RecurringTheme upsert
 * - buildThemeSummaryPrompt: session formatting for Haiku prompt
 */

import { prisma } from '../../lib/prisma';

// Mock prisma
jest.mock('../../lib/prisma');

// Mock bedrock
jest.mock('../../lib/bedrock', () => ({
  getHaikuJson: jest.fn(),
  BrainActivityCallType: {
    CROSS_SESSION_THEME: 'CROSS_SESSION_THEME',
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
import { detectRecurringTheme, buildThemeSummaryPrompt } from '../theme-detector';

const mockGetHaikuJson = getHaikuJson as jest.MockedFunction<typeof getHaikuJson>;
const mockWithHaikuCircuitBreaker = withHaikuCircuitBreaker as jest.MockedFunction<
  typeof withHaikuCircuitBreaker
>;

// ============================================================================
// Helpers
// ============================================================================

function makeSession(
  id: string,
  createdAt: Date,
  takeaways: Array<{ content: string }> = [],
) {
  return {
    id,
    createdAt,
    takeaways,
  };
}

// ============================================================================
// buildThemeSummaryPrompt
// ============================================================================

describe('buildThemeSummaryPrompt', () => {
  it('formats sessions with takeaways correctly', () => {
    const sessions = [
      makeSession('s1', new Date('2026-01-01'), [
        { content: 'I felt unheard' },
        { content: 'I needed space' },
      ]),
      makeSession('s2', new Date('2026-01-15'), [
        { content: 'Work stress was overwhelming' },
      ]),
    ];
    const prompt = buildThemeSummaryPrompt('work stress', sessions);

    expect(prompt).toContain('work stress');
    expect(prompt).toContain('I felt unheard');
    expect(prompt).toContain('I needed space');
    expect(prompt).toContain('Work stress was overwhelming');
    // Should include session numbers or dates
    expect(prompt).toContain('Session 1');
    expect(prompt).toContain('Session 2');
  });

  it('handles sessions with no takeaways gracefully', () => {
    const sessions = [
      makeSession('s1', new Date('2026-01-01'), []),
      makeSession('s2', new Date('2026-01-15'), [{ content: 'Some takeaway' }]),
    ];
    const prompt = buildThemeSummaryPrompt('loneliness', sessions);

    expect(prompt).toContain('loneliness');
    expect(prompt).toContain('(no takeaways yet)');
    expect(prompt).toContain('Some takeaway');
  });

  it('includes JSON output instruction', () => {
    const sessions = [makeSession('s1', new Date(), [{ content: 'Test' }])];
    const prompt = buildThemeSummaryPrompt('test theme', sessions);

    expect(prompt).toContain('"summary"');
  });

  it('includes instruction to use the person\'s own words', () => {
    const sessions = [makeSession('s1', new Date(), [{ content: 'Test' }])];
    const prompt = buildThemeSummaryPrompt('test theme', sessions);

    expect(prompt.toLowerCase()).toMatch(/own words|verbatim/);
  });
});

// ============================================================================
// detectRecurringTheme
// ============================================================================

describe('detectRecurringTheme', () => {
  const sessionId = 'session-1';
  const userId = 'user-1';
  const turnId = 'turn-1';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: circuit breaker passes through
    mockWithHaikuCircuitBreaker.mockImplementation(async (fn) => fn());
  });

  // --------------------------------------------------------------------------
  // Early return: no theme
  // --------------------------------------------------------------------------

  it('returns early when session has no theme (no DB writes, no Haiku call)', async () => {
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: null,
    });

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(prisma.innerWorkSession.count).not.toHaveBeenCalled();
    expect(mockGetHaikuJson).not.toHaveBeenCalled();
    expect(prisma.recurringTheme.upsert).not.toHaveBeenCalled();
  });

  it('returns early when findFirst returns null session', async () => {
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue(null);

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(prisma.innerWorkSession.count).not.toHaveBeenCalled();
    expect(mockGetHaikuJson).not.toHaveBeenCalled();
    expect(prisma.recurringTheme.upsert).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Early return: below threshold
  // --------------------------------------------------------------------------

  it('returns early when session theme appears in fewer than 3 sessions (count = 2)', async () => {
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: 'work stress',
    });
    (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(2);

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(mockGetHaikuJson).not.toHaveBeenCalled();
    expect(prisma.recurringTheme.upsert).not.toHaveBeenCalled();
  });

  it('returns early when session theme appears in fewer than 3 sessions (count = 1)', async () => {
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: 'isolation',
    });
    (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(1);

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(mockGetHaikuJson).not.toHaveBeenCalled();
    expect(prisma.recurringTheme.upsert).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Threshold met (3 sessions)
  // --------------------------------------------------------------------------

  it('calls getHaikuJson with CROSS_SESSION_THEME callType when threshold met', async () => {
    const tag = 'work stress';
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: tag,
    });
    (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(3);
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([
      makeSession('s1', new Date('2026-01-01'), [{ content: 'I felt overwhelmed' }]),
      makeSession('s2', new Date('2026-01-10'), [{ content: 'The deadline pressure' }]),
      makeSession('s3', new Date('2026-01-20'), [{ content: 'My boss keeps adding tasks' }]),
    ]);
    mockGetHaikuJson.mockResolvedValue({ summary: 'Cross-session summary text' });
    (prisma.recurringTheme.upsert as jest.Mock).mockResolvedValue({ id: 'rt-1' });

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(mockGetHaikuJson).toHaveBeenCalledWith(
      expect.objectContaining({
        callType: 'CROSS_SESSION_THEME',
        operation: 'cross-session-theme',
        turnId,
        maxTokens: 512,
      }),
    );
  });

  it('upserts RecurringTheme with correct tag, sessionCount, and summary when threshold met', async () => {
    const tag = 'work stress';
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: tag,
    });
    (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(3);
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([
      makeSession('s1', new Date(), [{ content: 'Takeaway 1' }]),
      makeSession('s2', new Date(), [{ content: 'Takeaway 2' }]),
      makeSession('s3', new Date(), [{ content: 'Takeaway 3' }]),
    ]);
    mockGetHaikuJson.mockResolvedValue({ summary: 'Cross-session summary text' });
    (prisma.recurringTheme.upsert as jest.Mock).mockResolvedValue({ id: 'rt-1' });

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(prisma.recurringTheme.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_tag: { userId, tag } },
        create: expect.objectContaining({
          userId,
          tag,
          sessionCount: 3,
          summary: 'Cross-session summary text',
          summaryAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          sessionCount: 3,
          summary: 'Cross-session summary text',
          summaryAt: expect.any(Date),
        }),
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Update path: regenerates summary every time above threshold
  // --------------------------------------------------------------------------

  it('regenerates summary when RecurringTheme already exists (upsert update path includes summary)', async () => {
    const tag = 'loneliness';
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: tag,
    });
    (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(5);
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        makeSession(`s${i}`, new Date(), [{ content: `Takeaway ${i}` }]),
      ),
    );
    mockGetHaikuJson.mockResolvedValue({ summary: 'Updated cross-session summary' });
    (prisma.recurringTheme.upsert as jest.Mock).mockResolvedValue({ id: 'rt-existing' });

    await detectRecurringTheme({ sessionId, userId, turnId });

    // Verify the update path also includes summary (ensures regeneration)
    const upsertCall = (prisma.recurringTheme.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.update).toHaveProperty('summary', 'Updated cross-session summary');
    expect(upsertCall.update).toHaveProperty('summaryAt', expect.any(Date));
    expect(upsertCall.update).toHaveProperty('sessionCount', 5);
  });

  // --------------------------------------------------------------------------
  // Haiku failure handling
  // --------------------------------------------------------------------------

  it('does not write RecurringTheme when Haiku returns null (circuit breaker fallback)', async () => {
    const tag = 'anxiety';
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: tag,
    });
    (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(3);
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([
      makeSession('s1', new Date(), [{ content: 'Takeaway 1' }]),
      makeSession('s2', new Date(), [{ content: 'Takeaway 2' }]),
      makeSession('s3', new Date(), [{ content: 'Takeaway 3' }]),
    ]);
    mockGetHaikuJson.mockResolvedValue(null);

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(prisma.recurringTheme.upsert).not.toHaveBeenCalled();
  });

  it('does not write RecurringTheme when Haiku returns empty summary', async () => {
    const tag = 'grief';
    (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      theme: tag,
    });
    (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(4);
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([
      makeSession('s1', new Date(), [{ content: 'Takeaway 1' }]),
      makeSession('s2', new Date(), [{ content: 'Takeaway 2' }]),
      makeSession('s3', new Date(), [{ content: 'Takeaway 3' }]),
      makeSession('s4', new Date(), [{ content: 'Takeaway 4' }]),
    ]);
    mockGetHaikuJson.mockResolvedValue({ summary: '' });

    await detectRecurringTheme({ sessionId, userId, turnId });

    expect(prisma.recurringTheme.upsert).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Never throws — safe to call fire-and-forget
  // --------------------------------------------------------------------------

  it('does not throw when an unexpected error occurs (safe for fire-and-forget)', async () => {
    (prisma.innerWorkSession.findFirst as jest.Mock).mockRejectedValue(
      new Error('DB connection error'),
    );

    // Should not throw
    await expect(
      detectRecurringTheme({ sessionId, userId, turnId }),
    ).resolves.toBeUndefined();
  });
});
