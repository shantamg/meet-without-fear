/**
 * E2E Routes Tests
 *
 * Tests for E2E testing helper endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma');

describe('E2E Routes', () => {
  const originalEnv = process.env.E2E_AUTH_BYPASS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.E2E_AUTH_BYPASS = 'true';
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.E2E_AUTH_BYPASS = originalEnv;
    } else {
      delete process.env.E2E_AUTH_BYPASS;
    }
  });

  describe('POST /api/e2e/cleanup', () => {
    it('deletes users with @e2e.test emails when E2E_AUTH_BYPASS=true', async () => {
      const mockDeleteResult = { count: 3 };
      (prisma.user.deleteMany as jest.Mock).mockResolvedValue(mockDeleteResult);

      const { cleanupE2EUsers } = await import('../e2e');

      const req = {} as Request;
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock } as unknown as Response;
      const next = jest.fn() as NextFunction;

      await cleanupE2EUsers(req, res, next);

      expect(prisma.user.deleteMany).toHaveBeenCalledWith({
        where: {
          email: {
            endsWith: '@e2e.test',
          },
        },
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        deletedCount: 3,
      });
    });

    it('returns 403 when E2E_AUTH_BYPASS is not enabled', async () => {
      process.env.E2E_AUTH_BYPASS = 'false';

      // Re-import to pick up new env
      jest.resetModules();
      const { cleanupE2EUsers } = await import('../e2e');

      const req = {} as Request;
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock } as unknown as Response;
      const next = jest.fn() as NextFunction;

      await cleanupE2EUsers(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'E2E cleanup only available when E2E_AUTH_BYPASS is enabled',
      });
    });
  });
});
