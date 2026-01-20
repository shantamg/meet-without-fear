import { Request, Response } from 'express';
import {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  sendMessage,
  confirmFeelHeard,
  getConversationHistory,
} from '../../controllers/messages';
import { prisma } from '../../lib/prisma';

// Mock Prisma
jest.mock('../../lib/prisma');

// Mock realtime service
jest.mock('../../services/realtime', () => ({
  notifyPartner: jest.fn().mockResolvedValue(undefined),
  publishSessionEvent: jest.fn().mockResolvedValue(undefined),
  notifySessionMembers: jest.fn().mockResolvedValue(undefined),
  publishMessageAIResponse: jest.fn().mockResolvedValue(undefined),
  publishMessageError: jest.fn().mockResolvedValue(undefined),
}));

// Mock partner session classifier (fire-and-forget memory detection)
jest.mock('../../services/partner-session-classifier', () => ({
  runPartnerSessionClassifier: jest.fn().mockResolvedValue(null),
}));

// Mock bedrock
jest.mock('../../lib/bedrock', () => ({
  getSonnetResponse: jest.fn().mockResolvedValue('Mock response'),
}));

// Mock brain service
jest.mock('../../services/brain-service', () => ({
  brainService: {
    recordThinking: jest.fn().mockResolvedValue(undefined),
    broadcastMessage: jest.fn(),
  },
}));

// Mock stage prompts
jest.mock('../../services/stage-prompts', () => ({
  buildInitialMessagePrompt: jest.fn().mockReturnValue('Mock prompt'),
  buildStagePrompt: jest.fn().mockReturnValue('Mock stage prompt'),
}));

// Mock json extractor
jest.mock('../../utils/json-extractor', () => ({
  extractJsonFromResponse: jest.fn().mockReturnValue({}),
}));

// Mock embedding service
jest.mock('../../services/embedding', () => ({
  embedSessionContent: jest.fn().mockResolvedValue(true),
}));

// Mock conversation summarizer
jest.mock('../../services/conversation-summarizer', () => ({
  updateSessionSummary: jest.fn().mockResolvedValue(undefined),
}));

// Mock reconciler
jest.mock('../../services/reconciler', () => ({
  runReconcilerForDirection: jest.fn().mockResolvedValue(null),
  getSharedContextForGuesser: jest.fn().mockResolvedValue(null),
}));

// Mock request context
jest.mock('../../lib/request-context', () => ({
  updateContext: jest.fn(),
}));

// Helper to create mock request
function createMockRequest(options: {
  user?: { id: string; email: string; name?: string | null };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Partial<Request> {
  return {
    user: options.user,
    params: options.params || {},
    body: options.body || {},
    query: options.query || {},
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

describe('Messages API (Fire-and-Forget)', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
  const mockSessionId = 'session-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sessions/:id/messages (sendMessage - DEPRECATED)', () => {
    // The fire-and-forget endpoint has been deprecated in favor of SSE streaming.
    // All message sending should now use POST /sessions/:id/messages/stream.

    it('returns 410 Gone with deprecation message', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: 'Test message' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await sendMessage(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(410);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'ENDPOINT_DEPRECATED',
            message: expect.stringContaining('deprecated'),
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/feel-heard (confirmFeelHeard)', () => {
    it('marks user as feeling heard', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const updatedProgress = {
        ...mockStageProgress,
        gatesSatisfied: { feelHeard: true, confirmedAt: expect.any(Date) },
        status: 'GATE_PENDING',
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue(updatedProgress);

      // Mock partner progress check
      (prisma.relationshipMember.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id },
        { userId: 'partner-1' },
      ]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            confirmed: true,
            canAdvance: false, // Partner must also complete
          }),
        })
      );

      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId_userId_stage: {
              sessionId: mockSessionId,
              userId: mockUser.id,
              stage: 1,
            },
          },
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              feelHeardConfirmed: true,
            }),
          }),
        })
      );
    });

    it('indicates when both partners have completed', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      const partnerProgress = {
        id: 'progress-2',
        sessionId: mockSessionId,
        userId: 'partner-1',
        stage: 1,
        status: 'GATE_PENDING',
        gatesSatisfied: { feelHeard: true, confirmedAt: new Date() },
      };

      const mockSession = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationshipId: 'rel-1',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };

      // Mock session.findFirst for access check
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);

      // Mock session.findUnique for getPartnerUserId
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);

      // Mock stageProgress.findFirst for getting current stage (user is in stage 1)
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);

      // Mock stageProgress.findUnique - called for partner progress check
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(partnerProgress);

      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: { feelHeard: true, confirmedAt: new Date() },
        status: 'GATE_PENDING',
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            confirmed: true,
            partnerCompleted: true,
            canAdvance: true,
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('validates confirmed field is boolean', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: 'yes' }, // Invalid - should be boolean
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('allows saving optional feedback', async () => {
      const mockStageProgress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(mockStageProgress);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        ...mockStageProgress,
        gatesSatisfied: {
          feelHeard: true,
          confirmedAt: new Date(),
          feedback: 'The AI was very helpful',
        },
        status: 'GATE_PENDING',
      });

      (prisma.relationshipMember.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id },
        { userId: 'partner-1' },
      ]);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { confirmed: true, feedback: 'The AI was very helpful' },
      });
      const { res, statusMock } = createMockResponse();

      await confirmFeelHeard(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              feedback: 'The AI was very helpful',
            }),
          }),
        })
      );
    });
  });

  describe('GET /sessions/:id/messages (getConversationHistory)', () => {
    it('returns message history for the session', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          sessionId: mockSessionId,
          senderId: mockUser.id,
          role: 'USER',
          content: 'First message',
          stage: 1,
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'msg-2',
          sessionId: mockSessionId,
          senderId: null,
          role: 'AI',
          content: 'AI response',
          stage: 1,
          timestamp: new Date('2024-01-01T10:00:05Z'),
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        query: { limit: '50' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getConversationHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({ id: 'msg-1', role: 'USER' }),
              expect.objectContaining({ id: 'msg-2', role: 'AI' }),
            ]),
          }),
        })
      );
    });

    it('only returns messages for the current user', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          sessionId: mockSessionId,
          senderId: mockUser.id,
          role: 'USER',
          content: 'My message',
          stage: 1,
          timestamp: new Date(),
        },
      ];

      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }],
        },
      });

      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res } = createMockResponse();

      await getConversationHistory(req as Request, res as Response);

      // Verify the query filters by user (data isolation: only user's sent messages without recipient + messages for this user)
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId: mockSessionId,
            OR: expect.arrayContaining([
              expect.objectContaining({ senderId: mockUser.id, forUserId: null }),
              expect.objectContaining({ forUserId: mockUser.id }),
            ]),
          }),
        })
      );
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getConversationHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });
  });
});
