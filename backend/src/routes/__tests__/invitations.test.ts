import { Request, Response } from 'express';
import {
  createSession,
  getInvitation,
  acceptInvitation,
  declineInvitation,
} from '../../controllers/invitations';
import { prisma } from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    relationship: {
      create: jest.fn(),
    },
    relationshipMember: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    session: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stageProgress: {
      create: jest.fn(),
    },
    userVessel: {
      create: jest.fn(),
    },
    sharedVessel: {
      create: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
  },
}));

// Mock email service
jest.mock('../../services/email', () => ({
  sendInvitationEmail: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'mock-email-id',
    mocked: true,
  }),
}));

// Mock realtime service
jest.mock('../../services/realtime', () => ({
  notifyPartner: jest.fn().mockResolvedValue(undefined),
  notifyPartnerWithFallback: jest.fn().mockResolvedValue(undefined),
}));

// Mock notification service
jest.mock('../../services/notification', () => ({
  notifyInvitationAccepted: jest.fn().mockResolvedValue(undefined),
  notifyCompactSigned: jest.fn().mockResolvedValue(undefined),
  notifySessionJoined: jest.fn().mockResolvedValue(undefined),
  createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
}));

// Helper to create mock request
function createMockRequest(options: {
  user?: { id: string; email: string; name?: string | null };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}): Partial<Request> {
  return {
    user: options.user,
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

describe('Invitations API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sessions (createSession)', () => {
    it('creates session and invitation', async () => {
      const mockUser = { id: 'user-1', email: 'inviter@example.com', name: 'Inviter' };
      const mockRelationship = { id: 'rel-1' };
      const mockSession = { id: 'session-1', status: 'INVITED', createdAt: new Date() };
      const mockInvitation = { id: 'inv-1' };

      (prisma.relationship.create as jest.Mock).mockResolvedValue(mockRelationship);
      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.invitation.create as jest.Mock).mockResolvedValue(mockInvitation);
      (prisma.stageProgress.create as jest.Mock).mockResolvedValue({});
      (prisma.userVessel.create as jest.Mock).mockResolvedValue({});
      (prisma.sharedVessel.create as jest.Mock).mockResolvedValue({});
      (prisma.message.create as jest.Mock).mockResolvedValue({});

      const req = createMockRequest({
        user: mockUser,
        body: {
          inviteName: 'Partner Name',
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await createSession(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            session: expect.objectContaining({ id: 'session-1' }),
            invitationId: 'inv-1',
            invitationUrl: expect.stringContaining('/invitation/inv-1'),
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        body: { inviteName: 'Partner Name' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await createSession(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('validates request body', async () => {
      const mockUser = { id: 'user-1', email: 'inviter@example.com' };
      const req = createMockRequest({
        user: mockUser,
        body: {}, // Missing required fields
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await createSession(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });
  });

  describe('GET /invitations/:id (getInvitation)', () => {
    it('returns invitation details', async () => {
      const mockInvitation = {
        id: 'inv-123',
        invitedBy: { id: 'user-1', name: 'Inviter' },
        name: 'Partner',
        status: 'PENDING',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), // Tomorrow
        session: { id: 'session-1', status: 'INVITED' },
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);

      const req = createMockRequest({
        params: { id: 'inv-123' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            invitation: expect.objectContaining({
              id: 'inv-123',
              invitedBy: expect.objectContaining({ name: 'Inviter' }),
              status: 'PENDING',
            }),
          }),
        })
      );
    });

    it('returns 404 for non-existent invitation', async () => {
      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        params: { id: 'non-existent' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });

    it('shows expired status for expired pending invitations', async () => {
      const mockInvitation = {
        id: 'inv-123',
        invitedBy: { id: 'user-1', name: 'Inviter' },
        status: 'PENDING',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
        session: { id: 'session-1', status: 'INVITED' },
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);

      const req = createMockRequest({
        params: { id: 'inv-123' },
      });
      const { res, jsonMock } = createMockResponse();

      await getInvitation(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invitation: expect.objectContaining({
              status: 'EXPIRED',
            }),
          }),
        })
      );
    });
  });

  describe('POST /invitations/:id/accept (acceptInvitation)', () => {
    it('accepts invitation and joins session', async () => {
      const mockInvitation = {
        id: 'inv-123',
        invitedById: 'user-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 86400000),
        sessionId: 'session-1',
        session: {
          id: 'session-1',
          relationshipId: 'rel-1',
        },
        invitedBy: { id: 'user-1', name: 'Inviter' },
      };

      const mockSession = {
        id: 'session-1',
        status: 'ACTIVE',
        createdAt: new Date(),
        relationship: {
          id: 'rel-1',
          members: [
            { user: { id: 'user-1', name: 'Inviter' } },
            { user: { id: 'user-2', name: 'Accepter' } },
          ],
        },
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);
      (prisma.relationshipMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.relationshipMember.create as jest.Mock).mockResolvedValue({});
      (prisma.invitation.update as jest.Mock).mockResolvedValue({});
      (prisma.session.update as jest.Mock).mockResolvedValue({});
      (prisma.stageProgress.create as jest.Mock).mockResolvedValue({});
      (prisma.userVessel.create as jest.Mock).mockResolvedValue({});
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);

      const req = createMockRequest({
        user: { id: 'user-2', email: 'accepter@example.com', name: 'Accepter' },
        params: { id: 'inv-123' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await acceptInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            session: expect.objectContaining({ id: 'session-1' }),
          }),
        })
      );

      // Verify relationship join
      expect(prisma.relationshipMember.create).toHaveBeenCalled();
    });

    it('rejects expired invitation with 410', async () => {
      const mockInvitation = {
        id: 'inv-123',
        invitedById: 'user-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 86400000), // Expired
        session: { relationshipId: 'rel-1' },
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);
      (prisma.invitation.update as jest.Mock).mockResolvedValue({});

      const req = createMockRequest({
        user: { id: 'user-2', email: 'accepter@example.com' },
        params: { id: 'inv-123' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await acceptInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(410);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'EXPIRED' }),
        })
      );
    });

    it('prevents accepting own invitation', async () => {
      const mockInvitation = {
        id: 'inv-123',
        invitedById: 'user-1', // Same as requester
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 86400000),
        session: { relationshipId: 'rel-1' },
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);

      const req = createMockRequest({
        user: { id: 'user-1', email: 'inviter@example.com' },
        params: { id: 'inv-123' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await acceptInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Cannot accept your own invitation',
          }),
        })
      );
    });

    it('rejects already processed invitation', async () => {
      const mockInvitation = {
        id: 'inv-123',
        invitedById: 'user-1',
        status: 'ACCEPTED', // Already accepted
        expiresAt: new Date(Date.now() + 86400000),
        session: { relationshipId: 'rel-1' },
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);

      const req = createMockRequest({
        user: { id: 'user-2', email: 'accepter@example.com' },
        params: { id: 'inv-123' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await acceptInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });
  });

  describe('POST /invitations/:id/decline (declineInvitation)', () => {
    it('marks invitation as declined', async () => {
      const mockInvitation = {
        id: 'inv-123',
        status: 'PENDING',
        sessionId: 'session-1',
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);
      (prisma.invitation.update as jest.Mock).mockResolvedValue({});
      (prisma.session.update as jest.Mock).mockResolvedValue({});

      const req = createMockRequest({
        user: { id: 'user-2', email: 'decliner@example.com' },
        params: { id: 'inv-123' },
        body: { reason: 'Not ready' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await declineInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ declined: true }),
        })
      );

      expect(prisma.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-123' },
          data: expect.objectContaining({
            status: 'DECLINED',
            declineReason: 'Not ready',
          }),
        })
      );
    });

    it('works without decline reason', async () => {
      const mockInvitation = {
        id: 'inv-123',
        status: 'PENDING',
        sessionId: 'session-1',
      };

      (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(mockInvitation);
      (prisma.invitation.update as jest.Mock).mockResolvedValue({});
      (prisma.session.update as jest.Mock).mockResolvedValue({});

      const req = createMockRequest({
        user: { id: 'user-2', email: 'decliner@example.com' },
        params: { id: 'inv-123' },
        body: {},
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await declineInvitation(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ declined: true }),
        })
      );
    });
  });

});
