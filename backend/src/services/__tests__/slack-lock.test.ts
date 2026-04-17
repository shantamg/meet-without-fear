/**
 * Slack Lock Tests
 *
 * Verifies that `withSlackUserLock` acquires an advisory lock inside a
 * transaction, runs `fn`, and returns its result. Uses a mocked Prisma
 * transaction runner so no live DB is required.
 */

const executeRawMock = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
      return fn({
        $executeRaw: executeRawMock,
      });
    }),
  },
}));

import { prisma } from '../../lib/prisma';
import { withSlackUserLock } from '../slack-lock';

describe('withSlackUserLock', () => {
  beforeEach(() => {
    executeRawMock.mockReset();
    (prisma.$transaction as jest.Mock).mockClear();
  });

  it('acquires a pg_advisory_xact_lock before running the callback', async () => {
    executeRawMock.mockResolvedValue(1);
    const work = jest.fn().mockResolvedValue('done');

    const result = await withSlackUserLock('U123', work);

    expect(result).toBe('done');
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    // ExecuteRaw is called with a TemplateStringsArray — flatten to check shape.
    const [call] = executeRawMock.mock.calls;
    const joined = String(call[0].raw.join(' ')).toLowerCase();
    expect(joined).toContain('pg_advisory_xact_lock');
    expect(joined).toContain('hashtext');
    // Verify the lock was acquired BEFORE the work ran via invocation order.
    const lockOrder = executeRawMock.mock.invocationCallOrder[0];
    const workOrder = work.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(workOrder);
  });

  it('returns the callback result', async () => {
    executeRawMock.mockResolvedValue(1);
    const result = await withSlackUserLock('U456', async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it('propagates errors from the callback', async () => {
    executeRawMock.mockResolvedValue(1);
    await expect(
      withSlackUserLock('U789', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('uses a long transaction timeout so a slow turn does not abort', async () => {
    executeRawMock.mockResolvedValue(1);
    await withSlackUserLock('U000', async () => 1);

    const opts = (prisma.$transaction as jest.Mock).mock.calls[0][1];
    expect(opts).toMatchObject({ timeout: expect.any(Number) });
    expect(opts.timeout).toBeGreaterThanOrEqual(30_000);
  });
});
