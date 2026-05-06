/**
 * RLS utility tests
 *
 * Validates the withRLS helper and RLS_PROTECTED_TABLES constant.
 * Database-level RLS enforcement is tested separately during deployment
 * with a non-owner role; these tests cover the code-level contract.
 */

const mockExecuteRaw = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn();

jest.mock('../prisma', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { withRLS, RLS_PROTECTED_TABLES } from '../rls';

describe('RLS utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RLS_PROTECTED_TABLES', () => {
    it('includes all high-sensitivity tables from the migration', () => {
      const expected = [
        'InnerWorkSession',
        'InnerWorkMessage',
        'UserVessel',
        'UserMemory',
        'StageProgress',
        'EmpathyDraft',
        'ConsentRecord',
        'PreSessionMessage',
        'ValidationFeedbackDraft',
        'Message',
        'EmpathyAttempt',
      ];
      for (const table of expected) {
        expect(RLS_PROTECTED_TABLES.has(table)).toBe(true);
      }
      expect(RLS_PROTECTED_TABLES.size).toBe(expected.length);
    });
  });

  describe('withRLS', () => {
    it('opens an interactive transaction and sets app.current_user_id', async () => {
      const txClient = {
        $executeRaw: mockExecuteRaw,
        userVessel: { findMany: jest.fn().mockResolvedValue([{ id: 'v1' }]) },
      };

      mockTransaction.mockImplementation(async (fn: (tx: typeof txClient) => Promise<unknown>) => {
        return fn(txClient);
      });

      const result = await withRLS('user-123', async (tx) => {
        return (tx as unknown as typeof txClient).userVessel.findMany({ where: { sessionId: 'sess-1' } });
      });

      // Verify SET LOCAL was called
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

      // Verify the callback result is returned
      expect(result).toEqual([{ id: 'v1' }]);
    });

    it('propagates errors from the callback', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const txClient = { $executeRaw: mockExecuteRaw };
        return fn(txClient);
      });

      await expect(
        withRLS('user-456', async () => {
          throw new Error('query failed');
        }),
      ).rejects.toThrow('query failed');
    });
  });
});
