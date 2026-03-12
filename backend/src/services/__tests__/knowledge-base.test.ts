/**
 * Knowledge Base Controller Unit Tests
 *
 * Tests for:
 * - listTopics: groups sessions by theme, excludes null/archived, sorts by lastActivity
 * - getTopicTimeline: decodes URL-encoded tags, returns chronological sessions
 * - listRecurringThemes: returns themes sorted by sessionCount descending
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';

// Mock prisma
jest.mock('../../lib/prisma');

// Mock auth middleware — provide getUser returning a fixed user
jest.mock('../../middleware/auth', () => ({
  getUser: jest.fn(() => ({ id: 'test-user' })),
}));

// Mock errors middleware — pass-through asyncHandler + error classes
jest.mock('../../middleware/errors', () => ({
  asyncHandler: (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => fn,
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
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

import { listTopics, getTopicTimeline, listRecurringThemes } from '../../controllers/knowledge-base';

// ============================================================================
// Helpers
// ============================================================================

function makeRes() {
  const json = jest.fn();
  return { json } as unknown as Response;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: 'test-user' },
    ...overrides,
  } as unknown as Request;
}

function makeNext(): NextFunction {
  return jest.fn();
}

function makeSession(
  id: string,
  theme: string | null,
  takeaways: Array<{ id: string; content: string; theme: string | null }> = [],
  overrides: Partial<{
    title: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id,
    title: overrides.title ?? `Session ${id}`,
    theme,
    status: overrides.status ?? 'ACTIVE',
    createdAt: overrides.createdAt ?? new Date('2024-01-01T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01T12:00:00Z'),
    takeaways: takeaways.map((t, idx) => ({
      id: t.id,
      content: t.content,
      theme: t.theme,
      position: idx,
    })),
  };
}

function makeTheme(tag: string, sessionCount: number, summary = 'A recurring theme') {
  return {
    id: `theme-${tag}`,
    userId: 'test-user',
    tag,
    sessionCount,
    summary,
    summaryAt: new Date('2024-01-10T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-10T00:00:00Z'),
  };
}

// ============================================================================
// listTopics
// ============================================================================

describe('listTopics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty topics array when user has no sessions with themes', async () => {
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([]);

    const req = makeReq();
    const res = makeRes();

    await listTopics(req, res, makeNext());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { topics: [] },
    });
  });

  it('groups sessions by theme correctly with sessionCount, takeawayCount, and lastActivity', async () => {
    const sessions = [
      makeSession('s1', 'work stress', [
        { id: 't1', content: 'I need boundaries', theme: 'needs' },
        { id: 't2', content: 'I felt overwhelmed', theme: null },
      ], { updatedAt: new Date('2024-01-05T12:00:00Z') }),
      makeSession('s2', 'work stress', [
        { id: 't3', content: 'Work is too much', theme: 'work' },
      ], { updatedAt: new Date('2024-01-08T12:00:00Z') }),
      makeSession('s3', 'relationship', [
        { id: 't4', content: 'I felt unheard', theme: 'connection' },
      ], { updatedAt: new Date('2024-01-03T12:00:00Z') }),
    ];

    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const req = makeReq();
    const res = makeRes();

    await listTopics(req, res, makeNext());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.success).toBe(true);
    const { topics } = response.data;

    const workStress = topics.find((t: any) => t.tag === 'work stress');
    expect(workStress).toBeDefined();
    expect(workStress.sessionCount).toBe(2);
    expect(workStress.takeawayCount).toBe(3); // s1 has 2, s2 has 1
    expect(workStress.sessions).toHaveLength(2);

    const relationship = topics.find((t: any) => t.tag === 'relationship');
    expect(relationship).toBeDefined();
    expect(relationship.sessionCount).toBe(1);
    expect(relationship.takeawayCount).toBe(1);
  });

  it('sorts topic groups by lastActivity descending (most recently active first)', async () => {
    const sessions = [
      makeSession('s1', 'old topic', [], { updatedAt: new Date('2024-01-01T00:00:00Z') }),
      makeSession('s2', 'recent topic', [], { updatedAt: new Date('2024-01-10T00:00:00Z') }),
      makeSession('s3', 'middle topic', [], { updatedAt: new Date('2024-01-05T00:00:00Z') }),
    ];

    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const req = makeReq();
    const res = makeRes();

    await listTopics(req, res, makeNext());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    const { topics } = response.data;

    expect(topics[0].tag).toBe('recent topic');
    expect(topics[1].tag).toBe('middle topic');
    expect(topics[2].tag).toBe('old topic');
  });

  it('excludes sessions where theme is null (handled by DB where clause)', async () => {
    // The controller queries with theme: { not: null }
    // Simulate DB returning only non-null-theme sessions
    const sessions = [
      makeSession('s1', 'work stress', []),
    ];

    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const req = makeReq();
    const res = makeRes();

    await listTopics(req, res, makeNext());

    // Verify the findMany was called with the correct where clause
    expect(prisma.innerWorkSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          theme: { not: null },
        }),
      })
    );
  });

  it('excludes ARCHIVED sessions (handled by DB where clause)', async () => {
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([]);

    const req = makeReq();
    const res = makeRes();

    await listTopics(req, res, makeNext());

    expect(prisma.innerWorkSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'ARCHIVED' },
        }),
      })
    );
  });
});

// ============================================================================
// getTopicTimeline
// ============================================================================

describe('getTopicTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns sessions for a given tag in chronological order (oldest first)', async () => {
    const sessions = [
      makeSession('s1', 'work stress', [
        { id: 't1', content: 'Takeaway 1', theme: null },
      ], { createdAt: new Date('2024-01-01T00:00:00Z') }),
      makeSession('s2', 'work stress', [
        { id: 't2', content: 'Takeaway 2', theme: 'needs' },
      ], { createdAt: new Date('2024-01-10T00:00:00Z') }),
    ];

    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const req = makeReq({ params: { tag: 'work stress' } });
    const res = makeRes();

    await getTopicTimeline(req, res, makeNext());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data.tag).toBe('work stress');
    expect(response.data.sessions).toHaveLength(2);

    // Verify chronological order query
    expect(prisma.innerWorkSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
      })
    );
  });

  it('decodes URL-encoded tag parameter', async () => {
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ params: { tag: 'work%20stress' } });
    const res = makeRes();

    await getTopicTimeline(req, res, makeNext());

    // The decoded tag 'work stress' should be used in the query
    expect(prisma.innerWorkSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          theme: 'work stress',
        }),
      })
    );

    // And returned in the response
    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.data.tag).toBe('work stress');
  });

  it('returns empty sessions array for a tag with no matches', async () => {
    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ params: { tag: 'nonexistent' } });
    const res = makeRes();

    await getTopicTimeline(req, res, makeNext());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data.tag).toBe('nonexistent');
    expect(response.data.sessions).toEqual([]);
  });

  it('maps session takeaways correctly in timeline response', async () => {
    const sessions = [
      makeSession('s1', 'anxiety', [
        { id: 't1', content: 'I felt anxious', theme: 'anxiety' },
        { id: 't2', content: 'I need support', theme: null },
      ]),
    ];

    (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const req = makeReq({ params: { tag: 'anxiety' } });
    const res = makeRes();

    await getTopicTimeline(req, res, makeNext());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    const session = response.data.sessions[0];
    expect(session.sessionId).toBe('s1');
    expect(session.takeaways).toHaveLength(2);
    expect(session.takeaways[0]).toEqual({ id: 't1', content: 'I felt anxious', theme: 'anxiety' });
    expect(session.takeaways[1]).toEqual({ id: 't2', content: 'I need support', theme: null });
  });
});

// ============================================================================
// listRecurringThemes
// ============================================================================

describe('listRecurringThemes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns themes sorted by sessionCount descending', async () => {
    const themes = [
      makeTheme('work stress', 5),
      makeTheme('relationship', 12),
      makeTheme('anxiety', 3),
    ];

    (prisma.recurringTheme.findMany as jest.Mock).mockResolvedValue(themes);

    const req = makeReq();
    const res = makeRes();

    await listRecurringThemes(req, res, makeNext());

    // Verify the query uses correct ordering
    expect(prisma.recurringTheme.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { sessionCount: 'desc' },
      })
    );

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data.themes).toHaveLength(3);
    // DB returns in order (mocked), so just verify shape
    expect(response.data.themes[0].tag).toBe('work stress');
    expect(response.data.themes[0].sessionCount).toBe(5);
    expect(response.data.themes[0].summary).toBe('A recurring theme');
    expect(typeof response.data.themes[0].summaryAt).toBe('string'); // ISO string
    expect(typeof response.data.themes[0].updatedAt).toBe('string'); // ISO string
  });

  it('returns empty array when no themes exist', async () => {
    (prisma.recurringTheme.findMany as jest.Mock).mockResolvedValue([]);

    const req = makeReq();
    const res = makeRes();

    await listRecurringThemes(req, res, makeNext());

    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.success).toBe(true);
    expect(response.data.themes).toEqual([]);
  });

  it('filters themes by userId', async () => {
    (prisma.recurringTheme.findMany as jest.Mock).mockResolvedValue([]);

    const req = makeReq();
    const res = makeRes();

    await listRecurringThemes(req, res, makeNext());

    expect(prisma.recurringTheme.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'test-user' },
      })
    );
  });
});
