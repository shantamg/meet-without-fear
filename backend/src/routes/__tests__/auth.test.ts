/**
 * Auth Routes Tests
 *
 * Tests for auth API endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import { getMe, updateProfile, updatePushToken, deletePushToken, getAblyToken } from '../../controllers/auth';
import { prisma } from '../../lib/prisma';
import { UnauthorizedError, ValidationError } from '../../middleware/errors';

// Mock Prisma
jest.mock('../../lib/prisma');


// Helper to create mock request
function createMockRequest(options: {
  user?: {
    id: string;
    email: string;
    name: string | null;
    pushToken: string | null;
    createdAt: Date;
    updatedAt: Date;
    clerkId: string | null;
  };
  body?: Record<string, unknown>;
}): Partial<Request> {
  return {
    user: options.user as Request['user'],
    body: options.body || {},
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

describe('Auth API', () => {
  const mockUser = {
    id: 'user-123',
    clerkId: 'clerk-123',
    email: 'test@example.com',
    name: 'Test User',
    pushToken: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
  });

  describe('GET /auth/me (getMe)', () => {
    it('returns user profile with active session count', async () => {
      (prisma.session.count as jest.Mock).mockResolvedValue(2);

      const req = createMockRequest({ user: mockUser });
      const { res, jsonMock } = createMockResponse();

      await getMe(req as Request, res as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            name: mockUser.name,
            createdAt: mockUser.createdAt.toISOString(),
          },
          activeSessions: 2,
          pushNotificationsEnabled: false,
        },
      });
    });

    it('returns pushNotificationsEnabled true when pushToken exists', async () => {
      (prisma.session.count as jest.Mock).mockResolvedValue(0);

      const userWithPushToken = { ...mockUser, pushToken: 'expo-token-123' };
      const req = createMockRequest({ user: userWithPushToken });
      const { res, jsonMock } = createMockResponse();

      await getMe(req as Request, res as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            pushNotificationsEnabled: true,
          }),
        })
      );
    });

    it('throws UnauthorizedError when no user', async () => {
      const req = createMockRequest({});
      const { res } = createMockResponse();

      await getMe(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('PATCH /auth/me (updateProfile)', () => {
    it('updates user name', async () => {
      const updatedUser = { ...mockUser, name: 'New Name' };
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      const req = createMockRequest({
        user: mockUser,
        body: { name: 'New Name' },
      });
      const { res, jsonMock } = createMockResponse();

      await updateProfile(req as Request, res as Response, mockNext);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { name: 'New Name' },
      });
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: 'New Name',
            createdAt: updatedUser.createdAt.toISOString(),
          },
        },
      });
    });

    it('throws ValidationError for empty name', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { name: '' },
      });
      const { res } = createMockResponse();

      await updateProfile(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('throws ValidationError for name over 100 characters', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { name: 'x'.repeat(101) },
      });
      const { res } = createMockResponse();

      await updateProfile(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('accepts empty body (no changes)', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const req = createMockRequest({
        user: mockUser,
        body: {},
      });
      const { res, jsonMock } = createMockResponse();

      await updateProfile(req as Request, res as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('throws UnauthorizedError when no user', async () => {
      const req = createMockRequest({ body: { name: 'Test' } });
      const { res } = createMockResponse();

      await updateProfile(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('POST /auth/push-token (updatePushToken)', () => {
    it('registers push token', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        pushToken: 'expo-token-123',
      });

      const req = createMockRequest({
        user: mockUser,
        body: { pushToken: 'expo-token-123', platform: 'ios' },
      });
      const { res, jsonMock } = createMockResponse();

      await updatePushToken(req as Request, res as Response, mockNext);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { pushToken: 'expo-token-123' },
      });
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: { registered: true },
      });
    });

    it('accepts android platform', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        pushToken: 'android-token',
      });

      const req = createMockRequest({
        user: mockUser,
        body: { pushToken: 'android-token', platform: 'android' },
      });
      const { res, jsonMock } = createMockResponse();

      await updatePushToken(req as Request, res as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: { registered: true },
      });
    });

    it('throws ValidationError for missing pushToken', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { platform: 'ios' },
      });
      const { res } = createMockResponse();

      await updatePushToken(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('throws ValidationError for invalid platform', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { pushToken: 'token', platform: 'web' },
      });
      const { res } = createMockResponse();

      await updatePushToken(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('throws UnauthorizedError when no user', async () => {
      const req = createMockRequest({
        body: { pushToken: 'token', platform: 'ios' },
      });
      const { res } = createMockResponse();

      await updatePushToken(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('DELETE /auth/push-token (deletePushToken)', () => {
    it('removes push token', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        pushToken: null,
      });

      const req = createMockRequest({ user: mockUser });
      const { res, jsonMock } = createMockResponse();

      await deletePushToken(req as Request, res as Response, mockNext);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { pushToken: null },
      });
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: { registered: false },
      });
    });

    it('throws UnauthorizedError when no user', async () => {
      const req = createMockRequest({});
      const { res } = createMockResponse();

      await deletePushToken(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('GET /auth/ably-token (getAblyToken)', () => {
    it('returns mock token when Ably is not configured', async () => {
      // Ensure ABLY_API_KEY is not set
      delete process.env.ABLY_API_KEY;

      (prisma.session.findMany as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ user: mockUser });
      const { res, jsonMock } = createMockResponse();

      await getAblyToken(req as Request, res as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          tokenRequest: expect.objectContaining({
            keyName: 'mock-key-name',
            ttl: 3600000,
            timestamp: expect.any(Number),
            capability: expect.any(String),
            clientId: mockUser.id,
            nonce: expect.any(String),
            mac: 'mock-mac-signature',
          }),
        },
      });
    });

    it('returns mock token with full capability when Ably not configured', async () => {
      // When ABLY_API_KEY is not set, returns mock token without querying sessions
      delete process.env.ABLY_API_KEY;

      const req = createMockRequest({ user: mockUser });
      const { res, jsonMock } = createMockResponse();

      await getAblyToken(req as Request, res as Response, mockNext);

      // Should NOT query sessions when in mock mode
      expect(prisma.session.findMany).not.toHaveBeenCalled();

      const response = jsonMock.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data.tokenRequest.clientId).toBe(mockUser.id);
      // Mock token has full capability
      expect(response.data.tokenRequest.capability).toBe(JSON.stringify({ '*': ['subscribe', 'publish'] }));
    });

    it('throws UnauthorizedError when no user', async () => {
      const req = createMockRequest({});
      const { res } = createMockResponse();

      await getAblyToken(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });
});
