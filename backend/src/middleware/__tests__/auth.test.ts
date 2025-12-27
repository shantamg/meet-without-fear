/**
 * Auth Middleware Tests
 *
 * Tests for authentication middleware including mock auth and Clerk auth.
 */

import { Request, Response, NextFunction } from 'express';
import { requireAuth, optionalAuth, createMockAuthHeader, getUser } from '../auth';
import { prisma } from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    relationshipMember: {
      findFirst: jest.fn(),
    },
    session: {
      findFirst: jest.fn(),
    },
  },
}));

// Mock Clerk verifyToken - will fail in test environment
jest.mock('@clerk/express', () => ({
  verifyToken: jest.fn().mockRejectedValue(new Error('Clerk not configured')),
}));

// Helper to create mock request
function createMockRequest(options: {
  headers?: Record<string, string>;
  user?: { id: string; email: string; name?: string | null; pushToken?: string | null; createdAt?: Date; updatedAt?: Date; clerkId?: string | null };
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
    clerkId: null,
    email: 'test@example.com',
    name: 'Test User',
    pushToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment for each test
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_PUBLISHABLE_KEY;
  });

  describe('requireAuth', () => {
    it('rejects requests without auth header', async () => {
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

    it('accepts valid X-Mock-User-Id header', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const req = createMockRequest({
        headers: {
          'x-mock-user-id': mockUser.id,
          'x-mock-user-email': mockUser.email,
          'x-mock-user-name': mockUser.name || '',
        },
      });
      const { res } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(mockUser.id);
    });

    it('accepts valid Mock authorization header', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const mockAuthHeader = createMockAuthHeader({
        userId: mockUser.id,
        email: mockUser.email,
        name: mockUser.name || undefined,
      });

      const req = createMockRequest({
        headers: { authorization: mockAuthHeader },
      });
      const { res } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(mockUser.id);
    });

    it('accepts Bearer test-token-{userId} format', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const req = createMockRequest({
        headers: { authorization: `Bearer test-token-${mockUser.id}` },
      });
      const { res } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });

    it('creates new user if not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const req = createMockRequest({
        headers: {
          'x-mock-user-id': 'new-user-id',
          'x-mock-user-email': 'new@example.com',
        },
      });
      const { res } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('rejects invalid authorization format', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Invalid format' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();
      const next = jest.fn();

      await requireAuth(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
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

    it('populates user when valid auth header', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const req = createMockRequest({
        headers: {
          'x-mock-user-id': mockUser.id,
          'x-mock-user-email': mockUser.email,
        },
      });
      const { res, statusMock } = createMockResponse();
      const next = jest.fn();

      await optionalAuth(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(mockUser.id);
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

  describe('createMockAuthHeader', () => {
    it('creates valid Mock authorization header', () => {
      const header = createMockAuthHeader({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(header).toMatch(/^Mock /);

      // Decode and verify
      const payload = header.slice(5);
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
      expect(decoded).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    it('works without name', () => {
      const header = createMockAuthHeader({
        userId: 'user-123',
        email: 'test@example.com',
      });

      expect(header).toMatch(/^Mock /);

      const payload = header.slice(5);
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
      expect(decoded.userId).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
    });
  });
});
