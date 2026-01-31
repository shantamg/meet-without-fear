/**
 * E2E Routes Tests
 *
 * Tests for E2E testing helper endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';

// Set up fixtures path for tests BEFORE any imports
process.env.E2E_FIXTURES_PATH = path.join(__dirname, '../../lib/__tests__/test-fixtures');

// Mock Prisma
jest.mock('../../lib/prisma');

// Import after mock setup
import { prisma } from '../../lib/prisma';
import { cleanupE2EUsers, seedE2EUser } from '../e2e';

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

  describe('POST /api/e2e/seed', () => {
    it('creates user with email and name when provided', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@e2e.test',
        name: 'Test User',
      };
      (prisma.user.upsert as jest.Mock).mockResolvedValue(mockUser);

      const req = {
        body: { email: 'test@e2e.test', name: 'Test User' },
      } as Request;
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock } as unknown as Response;
      const next = jest.fn() as NextFunction;

      await seedE2EUser(req, res, next);

      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'test@e2e.test' },
          update: { name: 'Test User' },
          create: expect.objectContaining({
            email: 'test@e2e.test',
            name: 'Test User',
            clerkId: expect.stringMatching(/^e2e_/),
          }),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@e2e.test',
        name: 'Test User',
      });
    });

    it('returns 400 if email does not end with @e2e.test', async () => {
      const req = {
        body: { email: 'test@example.com', name: 'Test User' },
      } as Request;
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock } as unknown as Response;
      const next = jest.fn() as NextFunction;

      await seedE2EUser(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Email must end with @e2e.test',
      });
    });

    it('returns 400 if neither email nor fixtureId provided', async () => {
      const req = { body: {} } as Request;
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock } as unknown as Response;
      const next = jest.fn() as NextFunction;

      await seedE2EUser(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Either email or fixtureId is required',
      });
    });

    it('returns 403 when E2E_AUTH_BYPASS is not enabled', async () => {
      process.env.E2E_AUTH_BYPASS = 'false';

      const req = {
        body: { email: 'test@e2e.test' },
      } as Request;
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock } as unknown as Response;
      const next = jest.fn() as NextFunction;

      await seedE2EUser(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'E2E seed only available when E2E_AUTH_BYPASS is enabled',
      });
    });

    it('loads user from fixture when fixtureId is provided', async () => {
      const mockUser = {
        id: 'user-a',
        email: 'user-a@e2e.test',
        name: 'Alice Test',
      };
      (prisma.user.upsert as jest.Mock).mockResolvedValue(mockUser);

      const req = {
        body: { fixtureId: 'test-fixture' },
      } as Request;
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock, json: jsonMock } as unknown as Response;
      const next = jest.fn() as NextFunction;

      await seedE2EUser(req, res, next);

      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'user-a@e2e.test' },
          update: { name: 'Alice Test' },
          create: expect.objectContaining({
            email: 'user-a@e2e.test',
            name: 'Alice Test',
            clerkId: expect.stringMatching(/^e2e_/),
          }),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(201);
    });
  });
});
