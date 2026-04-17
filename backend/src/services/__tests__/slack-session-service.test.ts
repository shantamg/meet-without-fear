/**
 * Slack Session Service Tests (unit)
 *
 * Focus: the duplicate-session catch helpers added in Phase A.2. Uses a
 * jest-mocked Prisma so no live DB is required.
 */

const sessionFindFirst = jest.fn();
const sessionUpdate = jest.fn();
const sessionSlackThreadDeleteMany = jest.fn();
const transactionMock = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findFirst: sessionFindFirst,
      update: sessionUpdate,
    },
    sessionSlackThread: {
      deleteMany: sessionSlackThreadDeleteMany,
    },
    $transaction: transactionMock,
  },
}));

import {
  findInvitedSessionForUser,
  archiveSession,
} from '../slack-session-service';
import { prisma } from '../../lib/prisma';

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
});
