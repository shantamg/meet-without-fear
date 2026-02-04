/**
 * Auth Middleware Tests
 *
 * Tests for Clerk-based authentication middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { requireAuth, optionalAuth, getUser } from '../auth';
import { prisma } from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma');


// Mock Clerk verifyToken and clerkClient
const mockVerifyToken = jest.fn();
const mockGetUser = jest.fn();
jest.mock('@clerk/express', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
  clerkClient: {
    users: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

// Helper to create mock request
function createMockRequest(options: {
  headers?: Record<string, string>;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    pushToken?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    clerkId?: string | null;
  };
  params?: Record<string, string>;
}): Partial<Request> {
  return {
    headers: options.headers || {},
    user: options.user as Request['user'],
    params: options.params || {},
  } as Partial<Request>;
}

// Helper to create mock response
function createMockResponse(): {
  res: Partial<Response>;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

  return {
    res: {
      status: statusMock,
      json: jsonMock,
    } as Partial<Response>,
    statusMock,
    jsonMock,
  };
}

describe('Auth Middleware', () => {
  const mockUser = {
    id: 'user-123',
    clerkId: 'clerk-user-123',
    email: 'test@example.com',
    name: 'Test User',
    pushToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up Clerk environment
    process.env.CLERK_SECRET_KEY = 'sk_test_xxx';
  });

  afterEach(() => {
    delete process.env.CLERK_SECRET_KEY;
  });

  describe('requireAuth', () => {
    it('returns 500 when CLERK_SECRET_KEY is not configured', async () => {
      delete process.env.CLERK_SECRET_KEY;

      const req = createMockRequest({ headers: {} });
      const { res, statusMock, jsonMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: expect.stringContaining('CLERK_SECRET_KEY'),
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when no auth header is provided', async () => {
      const req = createMockRequest({ headers: {} });
      const { res, statusMock, jsonMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token verification fails', async () => {
      mockVerifyToken.mockRejectedValue(new Error('Invalid token'));

      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('authenticates user with valid Clerk token', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk-user-123' });
      mockGetUser.mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });
      (prisma.user.upsert as jest.Mock).mockResolvedValue(mockUser);

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-clerk-token' },
      });
      const { res } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(mockVerifyToken).toHaveBeenCalledWith('valid-clerk-token', {
        secretKey: 'sk_test_xxx',
      });
      expect(mockGetUser).toHaveBeenCalledWith('clerk-user-123');
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { clerkId: 'clerk-user-123' },
        update: { email: 'test@example.com', name: 'Test User', firstName: 'Test', lastName: 'User' },
        create: {
          clerkId: 'clerk-user-123',
          email: 'test@example.com',
          name: 'Test User',
          firstName: 'Test',
          lastName: 'User',
        },
      });
      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
      expect(req.clerkUserId).toBe('clerk-user-123');
    });
  });

  describe('optionalAuth', () => {
    it('continues without user when no auth header', async () => {
      const req = createMockRequest({ headers: {} });
      const { res, statusMock } = createMockResponse();
      const next = jest.fn();

      await optionalAuth(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('populates user when valid Clerk token provided', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk-user-123' });
      mockGetUser.mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
        emailAddresses: [{ emailAddress: 'test@example.com' }],
      });
      (prisma.user.upsert as jest.Mock).mockResolvedValue(mockUser);

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-clerk-token' },
      });
      const { res, statusMock } = createMockResponse();
      const next = jest.fn();

      await optionalAuth(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });

    it('continues without user when token is invalid', async () => {
      mockVerifyToken.mockRejectedValue(new Error('Invalid token'));

      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const { res, statusMock } = createMockResponse();
      const next = jest.fn();

      await optionalAuth(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  });

  describe('getUser', () => {
    it('returns user when authenticated', () => {
      const req = createMockRequest({
        user: mockUser,
      });

      const user = getUser(req as Request);
      expect(user).toEqual(mockUser);
    });

    it('throws UnauthorizedError when no user', () => {
      const req = createMockRequest({});

      expect(() => getUser(req as Request)).toThrow('No authenticated user');
    });
  });

  describe('E2E Auth Bypass', () => {
    beforeEach(() => {
      process.env.E2E_AUTH_BYPASS = 'true';
    });

    afterEach(() => {
      delete process.env.E2E_AUTH_BYPASS;
    });

    it('authenticates user with e2e headers when bypass enabled', async () => {
      const e2eUser = {
        id: 'e2e-user-123',
        clerkId: 'e2e_e2e-user-123',
        email: 'test@e2e.test',
        name: null,
        firstName: null,
        lastName: null,
        pushToken: null,
        biometricEnabled: false,
        biometricEnrolledAt: null,
        lastMoodIntensity: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.user.upsert as jest.Mock).mockResolvedValue(e2eUser);

      const req = createMockRequest({
        headers: {
          'x-e2e-user-id': 'e2e-user-123',
          'x-e2e-user-email': 'test@e2e.test',
        },
      });
      const { res, statusMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { id: 'e2e-user-123' },
        create: { id: 'e2e-user-123', email: 'test@e2e.test', clerkId: 'e2e_e2e-user-123' },
        update: { email: 'test@e2e.test', clerkId: 'e2e_e2e-user-123' },
      });
      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(req.user).toEqual(e2eUser);
    });

    it('returns 401 when e2e headers missing and bypass enabled', async () => {
      const req = createMockRequest({ headers: {} });
      const { res, statusMock, jsonMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('bypasses e2e auth when E2E_AUTH_BYPASS is not true', async () => {
      process.env.E2E_AUTH_BYPASS = 'false';

      const req = createMockRequest({
        headers: {
          'x-e2e-user-id': 'e2e-user-123',
          'x-e2e-user-email': 'test@e2e.test',
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      // Without valid Clerk token, should fail
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('uses e2e auth even when Clerk header is present', async () => {
      const e2eUser = {
        id: 'e2e-user-123',
        clerkId: 'e2e_e2e-user-123',
        email: 'test@e2e.test',
        name: null,
        firstName: null,
        lastName: null,
        pushToken: null,
        biometricEnabled: false,
        biometricEnrolledAt: null,
        lastMoodIntensity: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.user.upsert as jest.Mock).mockResolvedValue(e2eUser);

      const req = createMockRequest({
        headers: {
          'x-e2e-user-id': 'e2e-user-123',
          'x-e2e-user-email': 'test@e2e.test',
          authorization: 'Bearer some-clerk-token',
        },
      });
      const { res, statusMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      // E2E bypass should take precedence, Clerk verification should not be called
      expect(mockVerifyToken).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(e2eUser);
    });
  });
});
