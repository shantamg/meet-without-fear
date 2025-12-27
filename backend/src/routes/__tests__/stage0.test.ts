import { Request, Response } from 'express';
import { signCompact, getCompactStatus } from '../../controllers/stage0';
import { prisma } from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    stageProgress: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
    },
    relationshipMember: {
      findMany: jest.fn(),
    },
  },
}));

// Mock realtime service
jest.mock('../../services/realtime', () => ({
  notifyPartner: jest.fn().mockResolvedValue(undefined),
}));

// Helper to create mock request
function createMockRequest(options: {
  user?: { id: string; email: string; name?: string | null };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}): Partial<Request> {
  return {
    user: options.user as Request['user'],
    params: options.params || {},
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

describe('Stage 0 API', () => {
  const mockUser = { id: 'user-1', email: 'user1@example.com', name: 'User 1' };
  const mockPartner = { id: 'user-2', email: 'user2@example.com', name: 'User 2' };
  const mockSessionId = 'session-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sessions/:id/compact/sign (signCompact)', () => {
    it('signs compact for authenticated user', async () => {
      // Mock: no existing stage progress (not signed yet)
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);

      // Mock: session exists with relationship members
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartner.id }],
        },
      });

      // Mock: partner has not signed
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(null);

      // Mock: upsert success
      (prisma.stageProgress.upsert as jest.Mock).mockResolvedValue({
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 0,
        status: 'IN_PROGRESS',
        gatesSatisfied: { compactSigned: true, signedAt: new Date().toISOString() },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { agreed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await signCompact(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            signed: true,
            signedAt: expect.any(String),
            partnerSigned: false,
            canAdvance: false,
          }),
        })
      );
    });

    it('returns 409 if already signed', async () => {
      // Mock: user has already signed
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue({
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 0,
        status: 'IN_PROGRESS',
        gatesSatisfied: { compactSigned: true, signedAt: '2024-01-01T00:00:00Z' },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { agreed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await signCompact(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'CONFLICT',
            message: 'Compact already signed',
          }),
        })
      );
    });

    it('returns canAdvance true when partner has also signed', async () => {
      // Mock: no existing progress for user
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);

      // Mock: session with relationship
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartner.id }],
        },
      });

      // Mock: partner HAS signed
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartner.id,
        stage: 0,
        gatesSatisfied: { compactSigned: true, signedAt: '2024-01-01T00:00:00Z' },
      });

      // Mock: upsert success
      (prisma.stageProgress.upsert as jest.Mock).mockResolvedValue({
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 0,
        status: 'IN_PROGRESS',
        gatesSatisfied: { compactSigned: true, signedAt: new Date().toISOString() },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { agreed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await signCompact(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            signed: true,
            partnerSigned: true,
            canAdvance: true,
          }),
        })
      );
    });

    it('validates agreed field is true', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { agreed: false },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await signCompact(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: { agreed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await signCompact(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
          }),
        })
      );
    });

    it('returns 404 for non-existent session', async () => {
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent-session' },
        body: { agreed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await signCompact(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/compact/status (getCompactStatus)', () => {
    it('returns signing status for both parties', async () => {
      // Mock: user has signed
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue({
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 0,
        gatesSatisfied: { compactSigned: true, signedAt: '2024-01-01T00:00:00Z' },
      });

      // Mock: session with relationship
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartner.id }],
        },
      });

      // Mock: partner has signed
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartner.id,
        stage: 0,
        gatesSatisfied: { compactSigned: true, signedAt: '2024-01-02T00:00:00Z' },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCompactStatus(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            mySigned: true,
            mySignedAt: '2024-01-01T00:00:00Z',
            partnerSigned: true,
            partnerSignedAt: '2024-01-02T00:00:00Z',
            canAdvance: true,
          }),
        })
      );
    });

    it('hides partnerSignedAt until user signs', async () => {
      // Mock: user has NOT signed
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);

      // Mock: session with relationship
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartner.id }],
        },
      });

      // Mock: partner has signed (but shouldn't be revealed)
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: mockPartner.id,
        stage: 0,
        gatesSatisfied: { compactSigned: true, signedAt: '2024-01-02T00:00:00Z' },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCompactStatus(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            mySigned: false,
            mySignedAt: null,
            partnerSigned: false, // Hidden because user hasn't signed
            partnerSignedAt: null, // Hidden because user hasn't signed
            canAdvance: false,
          }),
        })
      );
    });

    it('shows partial status when only user signed', async () => {
      // Mock: user has signed
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue({
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 0,
        gatesSatisfied: { compactSigned: true, signedAt: '2024-01-01T00:00:00Z' },
      });

      // Mock: session with relationship
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: mockPartner.id }],
        },
      });

      // Mock: partner has NOT signed
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCompactStatus(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            mySigned: true,
            mySignedAt: '2024-01-01T00:00:00Z',
            partnerSigned: false,
            partnerSignedAt: null,
            canAdvance: false,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCompactStatus(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
          }),
        })
      );
    });

    it('returns 404 for non-existent session', async () => {
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent-session' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getCompactStatus(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
          }),
        })
      );
    });
  });
});
