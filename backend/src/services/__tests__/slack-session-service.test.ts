/**
 * Slack Session Service Tests (unit)
 *
 * Focus: the duplicate-session catch helpers added in Phase A.2. Uses a
 * jest-mocked Prisma so no live DB is required.
 */

const sessionFindFirst = jest.fn();
const sessionFindUnique = jest.fn();
const sessionUpdate = jest.fn();
const sessionSlackThreadFindUnique = jest.fn();
const sessionSlackThreadDeleteMany = jest.fn();
const stageProgressFindFirst = jest.fn();
const stageProgressUpdate = jest.fn();
const stageProgressUpsert = jest.fn();
const transactionMock = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findFirst: sessionFindFirst,
      findUnique: sessionFindUnique,
      update: sessionUpdate,
    },
    sessionSlackThread: {
      findUnique: sessionSlackThreadFindUnique,
      deleteMany: sessionSlackThreadDeleteMany,
    },
    stageProgress: {
      findFirst: stageProgressFindFirst,
      update: stageProgressUpdate,
      upsert: stageProgressUpsert,
    },
    $transaction: transactionMock,
  },
}));

import {
  findInvitedSessionForUser,
  findSessionByJoinCode,
  findSessionByThread,
  archiveSession,
  hasUserCompacted,
  hasUserSentInvitation,
  advanceUserToStage,
  INVITED_SESSION_TTL_MS,
} from '../slack-session-service';
import { prisma } from '../../lib/prisma';
import { StageStatus } from '@prisma/client';

describe('slack-session-service helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transactionMock.mockImplementation(async (ops: unknown[]) => ops);
    sessionUpdate.mockResolvedValue({});
    sessionSlackThreadDeleteMany.mockResolvedValue({ count: 0 });
  });

  describe('findInvitedSessionForUser', () => {
    it('queries for the user\'s most recent INVITED session', async () => {
      sessionFindFirst.mockResolvedValue({ id: 's1', slackJoinCode: 'abc123' });

      const result = await findInvitedSessionForUser('user-1');

      expect(result).toMatchObject({ id: 's1', slackJoinCode: 'abc123' });
      expect(prisma.session.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'INVITED',
            relationship: { members: { some: { userId: 'user-1' } } },
          }),
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('returns null when no open invite exists', async () => {
      sessionFindFirst.mockResolvedValue(null);
      const result = await findInvitedSessionForUser('user-2');
      expect(result).toBeNull();
    });
  });

  describe('archiveSession', () => {
    it('flips status to ABANDONED and deletes thread mappings in a single transaction', async () => {
      await archiveSession('s1');

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(sessionUpdate).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'ABANDONED' },
      });
      expect(sessionSlackThreadDeleteMany).toHaveBeenCalledWith({
        where: { sessionId: 's1' },
      });
    });
  });

  // --- TTL + dead-session exclusion (Phase C.1 + C.2) ---

  describe('findSessionByThread', () => {
    const DAY = 24 * 60 * 60 * 1000;

    it('returns null when the thread is unmapped', async () => {
      sessionSlackThreadFindUnique.mockResolvedValue(null);
      const result = await findSessionByThread('C1', 'T1');
      expect(result).toBeNull();
    });

    it('returns the session for an active mapping', async () => {
      sessionSlackThreadFindUnique.mockResolvedValue({
        userId: 'u1',
        session: {
          id: 's1',
          status: 'ACTIVE',
          createdAt: new Date(Date.now() - 2 * DAY),
        },
      });
      const result = await findSessionByThread('C1', 'T1');
      expect(result).toMatchObject({ userId: 'u1', session: { id: 's1' } });
    });

    it('excludes ABANDONED sessions', async () => {
      sessionSlackThreadFindUnique.mockResolvedValue({
        userId: 'u1',
        session: { id: 's1', status: 'ABANDONED', createdAt: new Date() },
      });
      const result = await findSessionByThread('C1', 'T1');
      expect(result).toBeNull();
      expect(sessionUpdate).not.toHaveBeenCalled();
    });

    it('excludes ARCHIVED sessions', async () => {
      sessionSlackThreadFindUnique.mockResolvedValue({
        userId: 'u1',
        session: { id: 's1', status: 'ARCHIVED', createdAt: new Date() },
      });
      const result = await findSessionByThread('C1', 'T1');
      expect(result).toBeNull();
    });

    it('archives and returns null for INVITED sessions past the 7-day TTL', async () => {
      sessionSlackThreadFindUnique.mockResolvedValue({
        userId: 'u1',
        session: {
          id: 's1',
          status: 'INVITED',
          createdAt: new Date(Date.now() - 8 * DAY),
        },
      });
      const result = await findSessionByThread('C1', 'T1');
      expect(result).toBeNull();
      expect(sessionUpdate).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'ABANDONED' },
      });
      expect(sessionSlackThreadDeleteMany).toHaveBeenCalledWith({
        where: { sessionId: 's1' },
      });
    });

    it('does NOT archive INVITED sessions still within the TTL', async () => {
      sessionSlackThreadFindUnique.mockResolvedValue({
        userId: 'u1',
        session: {
          id: 's1',
          status: 'INVITED',
          createdAt: new Date(Date.now() - 3 * DAY),
        },
      });
      const result = await findSessionByThread('C1', 'T1');
      expect(result).toMatchObject({ userId: 'u1', session: { id: 's1' } });
      expect(sessionUpdate).not.toHaveBeenCalled();
    });
  });

  describe('findSessionByJoinCode', () => {
    const DAY = 24 * 60 * 60 * 1000;

    it('excludes dead sessions', async () => {
      sessionFindUnique.mockResolvedValue({
        id: 's1',
        status: 'ABANDONED',
        createdAt: new Date(),
      });
      const result = await findSessionByJoinCode('abc123');
      expect(result).toBeNull();
    });

    it('archives INVITED sessions past the TTL and returns null', async () => {
      sessionFindUnique.mockResolvedValue({
        id: 's2',
        status: 'INVITED',
        createdAt: new Date(Date.now() - 10 * DAY),
      });
      const result = await findSessionByJoinCode('abc123');
      expect(result).toBeNull();
      expect(sessionUpdate).toHaveBeenCalledWith({
        where: { id: 's2' },
        data: { status: 'ABANDONED' },
      });
    });

    it('returns valid INVITED sessions within the TTL', async () => {
      const session = {
        id: 's3',
        status: 'INVITED',
        createdAt: new Date(Date.now() - 1 * DAY),
      };
      sessionFindUnique.mockResolvedValue(session);
      const result = await findSessionByJoinCode('abc123');
      expect(result).toEqual(session);
      expect(sessionUpdate).not.toHaveBeenCalled();
    });
  });

  describe('findInvitedSessionForUser — TTL sweep', () => {
    const DAY = 24 * 60 * 60 * 1000;

    it('archives and returns null when the invite is stale', async () => {
      sessionFindFirst.mockResolvedValue({
        id: 's1',
        status: 'INVITED',
        createdAt: new Date(Date.now() - 9 * DAY),
      });
      const result = await findInvitedSessionForUser('u1');
      expect(result).toBeNull();
      expect(sessionUpdate).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'ABANDONED' },
      });
    });

    it('returns the invite when still fresh', async () => {
      const session = {
        id: 's2',
        status: 'INVITED',
        createdAt: new Date(Date.now() - 2 * DAY),
      };
      sessionFindFirst.mockResolvedValue(session);
      const result = await findInvitedSessionForUser('u1');
      expect(result).toEqual(session);
      expect(sessionUpdate).not.toHaveBeenCalled();
    });
  });

  it('INVITED_SESSION_TTL_MS is 7 days', () => {
    expect(INVITED_SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  // --- Per-user Stage 0 gate readers + solo advance (D.3b) ---

  describe('hasUserCompacted', () => {
    it('returns true when the user\'s Stage 0 row has compactSigned', async () => {
      stageProgressFindFirst.mockResolvedValue({
        gatesSatisfied: { compactSigned: true },
      });
      await expect(hasUserCompacted('s1', 'u1')).resolves.toBe(true);
      expect(stageProgressFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 's1', userId: 'u1', stage: 0 },
        })
      );
    });

    it('returns false when the flag is absent', async () => {
      stageProgressFindFirst.mockResolvedValue({ gatesSatisfied: {} });
      await expect(hasUserCompacted('s1', 'u1')).resolves.toBe(false);
    });

    it('returns false when no Stage 0 row exists for the user', async () => {
      stageProgressFindFirst.mockResolvedValue(null);
      await expect(hasUserCompacted('s1', 'u1')).resolves.toBe(false);
    });
  });

  describe('hasUserSentInvitation', () => {
    it('returns true when invitationSent is set', async () => {
      stageProgressFindFirst.mockResolvedValue({
        gatesSatisfied: { compactSigned: true, invitationSent: true },
      });
      await expect(hasUserSentInvitation('s1', 'u1')).resolves.toBe(true);
    });

    it('returns false when only compactSigned is set', async () => {
      stageProgressFindFirst.mockResolvedValue({
        gatesSatisfied: { compactSigned: true },
      });
      await expect(hasUserSentInvitation('s1', 'u1')).resolves.toBe(false);
    });

    it('returns false when no Stage 0 row exists', async () => {
      stageProgressFindFirst.mockResolvedValue(null);
      await expect(hasUserSentInvitation('s1', 'u1')).resolves.toBe(false);
    });
  });

  describe('advanceUserToStage', () => {
    beforeEach(() => {
      stageProgressUpdate.mockResolvedValue({});
      stageProgressUpsert.mockResolvedValue({});
    });

    it('completes the user\'s open row and upserts the next stage IN_PROGRESS', async () => {
      stageProgressFindFirst.mockResolvedValue({ id: 'sp-0' });

      await advanceUserToStage('s1', 'u1', 1);

      expect(stageProgressFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId: 's1',
            userId: 'u1',
            status: { not: StageStatus.COMPLETED },
          },
        })
      );
      expect(stageProgressUpdate).toHaveBeenCalledTimes(1);
      expect(stageProgressUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sp-0' },
          data: expect.objectContaining({ status: StageStatus.COMPLETED }),
        })
      );
      expect(stageProgressUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId_userId_stage: { sessionId: 's1', userId: 'u1', stage: 1 },
          },
          create: expect.objectContaining({
            sessionId: 's1',
            userId: 'u1',
            stage: 1,
            status: StageStatus.IN_PROGRESS,
          }),
          update: expect.objectContaining({
            status: StageStatus.IN_PROGRESS,
            completedAt: null,
          }),
        })
      );
    });

    it('upserts the new stage even when there is no open prior row', async () => {
      stageProgressFindFirst.mockResolvedValue(null);

      await advanceUserToStage('s1', 'u1', 1);

      expect(stageProgressUpdate).not.toHaveBeenCalled();
      expect(stageProgressUpsert).toHaveBeenCalledTimes(1);
    });

    it('does not touch other users\' rows', async () => {
      // The findFirst is user-scoped by argument; verify we never issue an
      // update without that user id filter. (Defensive — a future refactor
      // that accidentally drops the userId filter would be caught here.)
      stageProgressFindFirst.mockResolvedValue({ id: 'sp-0' });

      await advanceUserToStage('s1', 'u1', 1);

      const findCall = stageProgressFindFirst.mock.calls[0][0];
      expect(findCall.where.userId).toBe('u1');
      const upsertCall = stageProgressUpsert.mock.calls[0][0];
      expect(upsertCall.where.sessionId_userId_stage.userId).toBe('u1');
    });
  });
});
