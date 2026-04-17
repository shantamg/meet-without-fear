/**
 * Session Retention Tests
 */

const sessionFindMany = jest.fn();
const sessionUpdate = jest.fn();
const sessionDeleteMany = jest.fn();
const messageFindFirst = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findMany: sessionFindMany,
      update: sessionUpdate,
      deleteMany: sessionDeleteMany,
    },
    message: {
      findFirst: messageFindFirst,
    },
  },
}));

import {
  enforceSessionRetention,
  ACTIVE_SESSION_RETENTION_MS,
  ARCHIVED_SESSION_PURGE_MS,
} from '../session-retention';

describe('enforceSessionRetention', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date('2026-04-17T00:00:00Z');

  beforeEach(() => {
    sessionFindMany.mockReset();
    sessionUpdate.mockReset();
    sessionDeleteMany.mockReset();
    messageFindFirst.mockReset();
    sessionUpdate.mockResolvedValue({});
    sessionDeleteMany.mockResolvedValue({ count: 0 });
  });

  it('archives ACTIVE sessions whose most recent message is older than 90 days', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', updatedAt: new Date(NOW.getTime() - 120 * DAY) },
    ]);
    messageFindFirst.mockResolvedValue({
      timestamp: new Date(NOW.getTime() - 95 * DAY),
    });

    const result = await enforceSessionRetention(NOW);

    expect(result.archived).toBe(1);
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'ARCHIVED' },
    });
  });

  it('does NOT archive a session whose message is newer than 90d even if updatedAt is stale', async () => {
    // updatedAt is 120d old (session was last status-changed then), but a
    // recent message proves the session is active. We should NOT archive.
    sessionFindMany.mockResolvedValue([
      { id: 's1', updatedAt: new Date(NOW.getTime() - 120 * DAY) },
    ]);
    messageFindFirst.mockResolvedValue({
      timestamp: new Date(NOW.getTime() - 5 * DAY),
    });

    const result = await enforceSessionRetention(NOW);

    expect(result.archived).toBe(0);
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('uses updatedAt as a fallback when a session has no messages', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', updatedAt: new Date(NOW.getTime() - 200 * DAY) },
    ]);
    messageFindFirst.mockResolvedValue(null);

    const result = await enforceSessionRetention(NOW);

    expect(result.archived).toBe(1);
  });

  it('hard-deletes ARCHIVED sessions whose updatedAt is >90 days past archive', async () => {
    sessionFindMany.mockResolvedValue([]);
    sessionDeleteMany.mockResolvedValue({ count: 3 });

    const result = await enforceSessionRetention(NOW);

    expect(result.deleted).toBe(3);
    expect(sessionDeleteMany).toHaveBeenCalledWith({
      where: {
        status: 'ARCHIVED',
        updatedAt: { lt: new Date(NOW.getTime() - ARCHIVED_SESSION_PURGE_MS) },
      },
    });
  });

  it('filter query targets only CONFLICT_RESOLUTION ACTIVE/WAITING sessions', async () => {
    sessionFindMany.mockResolvedValue([]);

    await enforceSessionRetention(NOW);

    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'CONFLICT_RESOLUTION',
          status: { in: ['ACTIVE', 'WAITING'] },
          updatedAt: { lt: new Date(NOW.getTime() - ACTIVE_SESSION_RETENTION_MS) },
        }),
      })
    );
  });

  it('reports inspected count for observability', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', updatedAt: new Date(NOW.getTime() - 100 * DAY) },
      { id: 's2', updatedAt: new Date(NOW.getTime() - 100 * DAY) },
    ]);
    messageFindFirst.mockResolvedValueOnce({
      timestamp: new Date(NOW.getTime() - 95 * DAY),
    });
    messageFindFirst.mockResolvedValueOnce({
      timestamp: new Date(NOW.getTime() - 10 * DAY),
    });

    const result = await enforceSessionRetention(NOW);

    expect(result.inspected).toBe(2);
    expect(result.archived).toBe(1);
  });

  it('retention constants are 90 and 90 days (180d total soft-to-hard window)', () => {
    expect(ACTIVE_SESSION_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(ARCHIVED_SESSION_PURGE_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
