import { Request, Response } from 'express';
import {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  sendMessage,
  sendMessageStream,
  confirmFeelHeard,
  getConversationHistory,
  scrubVisibleAIText,
  isReadyForStage3RevealText,
} from '../../controllers/messages';
import { prisma } from '../../lib/prisma';
import { getSonnetStreamingResponse } from '../../lib/bedrock';

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
  getSonnetStreamingResponse: jest.fn(),
  BrainActivityCallType: {
    ORCHESTRATED_RESPONSE: 'ORCHESTRATED_RESPONSE',
  },
  isMockLLMEnabled: jest.fn().mockReturnValue(false),
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
  buildStagePrompt: jest.fn().mockReturnValue({ staticBlock: 'Mock static', dynamicBlock: 'Mock dynamic' }),
  buildStagePromptString: jest.fn().mockReturnValue('Mock stage prompt'),
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
  getSessionSummary: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/context-assembler', () => ({
  assembleContextBundle: jest.fn().mockResolvedValue({ notableFacts: [] }),
  formatContextForPrompt: jest.fn().mockReturnValue(''),
}));

jest.mock('../../services/shared-context', () => ({
  getMilestoneContext: jest.fn().mockResolvedValue(null),
  getSharedContentContext: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/llm-telemetry', () => ({
  estimateContextSizes: jest.fn().mockReturnValue({}),
  finalizeTurnMetrics: jest.fn(),
  recordContextSizes: jest.fn(),
}));

jest.mock('../../services/global-memory', () => ({
  consolidateGlobalFacts: jest.fn().mockResolvedValue(undefined),
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
    on: jest.fn(),
  } as Partial<Request>;
}

// Helper to create mock response
function createMockResponse(): {
  res: Partial<Response>;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
  writeMock: jest.Mock;
  endMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const writeMock = jest.fn();
  const endMock = jest.fn();

  return {
    res: {
      status: statusMock,
      json: jsonMock,
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: writeMock,
      end: endMock,
    } as Partial<Response>,
    statusMock,
    jsonMock,
    writeMock,
    endMock,
  };
}

describe('Messages API (Fire-and-Forget)', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
  const mockSessionId = 'session-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('planner text safety helpers', () => {
    describe('scrubVisibleAIText', () => {
      it('removes visible planner lines and flags the scrub', () => {
        const result = scrubVisibleAIText([
          'I should compare both lists before showing anything.',
          'That sounds like a need for more steadiness.',
          "Here's my plan: reveal the comparison.",
        ].join('\n'));

        expect(result.scrubbed).toBe(true);
        expect(result.text).toBe('That sounds like a need for more steadiness.');
      });

      it('preserves normal facilitation that starts with I need to', () => {
        const text = 'I need to make sure I am capturing this right: you want steadiness before deciding.';

        expect(scrubVisibleAIText(text)).toEqual({
          text,
          scrubbed: false,
        });
      });

      it('can preserve boundary whitespace for streamed chunks', () => {
        expect(scrubVisibleAIText(' talk ', { preserveBoundaryWhitespace: true })).toEqual({
          text: ' talk ',
          scrubbed: false,
        });
      });
    });

    describe('isReadyForStage3RevealText', () => {
      it('detects ready requests that mention needs reveal context', () => {
        expect(isReadyForStage3RevealText("I'm ready to see the needs lists")).toBe(true);
        expect(isReadyForStage3RevealText('We are ready for the side by side reveal')).toBe(true);
      });

      it('does not treat negated ready language as a reveal request', () => {
        expect(isReadyForStage3RevealText("I'm not ready to see the lists")).toBe(false);
        expect(isReadyForStage3RevealText("I don't want to show the needs yet")).toBe(false);
      });

      it('requires reveal context to avoid hijacking generic ready messages', () => {
        expect(isReadyForStage3RevealText("Yes, I'm ready")).toBe(false);
      });
    });

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

  describe('POST /sessions/:id/messages/stream (sendMessageStream)', () => {
    it('does NOT auto-advance Stage 1 when the LLM emits FeelHeardConfirmed:Y (feel-heard gate is button-only)', async () => {
      const stage1Progress = {
        id: 'progress-1',
        sessionId: mockSessionId,
        userId: mockUser.id,
        stage: 1,
        status: 'IN_PROGRESS',
        gatesSatisfied: { feelHeardCheckOffered: true },
      };
      const userMessage = {
        id: 'msg-user-1',
        sessionId: mockSessionId,
        senderId: mockUser.id,
        role: 'USER',
        content: 'Yes. That captures it. I feel heard.',
        stage: 1,
        timestamp: new Date('2026-05-07T08:00:00Z'),
      };
      const aiMessage = {
        id: 'msg-ai-1',
        sessionId: mockSessionId,
        senderId: null,
        forUserId: mockUser.id,
        role: 'AI',
        content: 'That feels complete. Now let us turn toward what your partner might be experiencing in this.',
        stage: 1,
        timestamp: new Date('2026-05-07T08:00:01Z'),
      };
      const session = {
        id: mockSessionId,
        status: 'ACTIVE',
        relationship: {
          members: [{ userId: mockUser.id }, { userId: 'partner-1' }],
        },
      };

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(session);
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(session);
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue(stage1Progress);
      (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue(stage1Progress);
      (prisma.message.create as jest.Mock).mockImplementation(async ({ data }) => (
        data.role === 'USER' ? userMessage : { ...aiMessage, content: data.content, stage: data.stage }
      ));
      (prisma.message.findMany as jest.Mock).mockResolvedValue([userMessage]);
      (prisma.message.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Partner' });
      (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue(null);

      async function* llmStream() {
        yield {
          type: 'text',
          text: 'Mode: WITNESS\nUserIntensity: 4\nFeelHeardCheck:Y\nFeelHeardConfirmed:Y\nStrategy: transition\n</thinking>\n',
        };
        yield {
          type: 'text',
          text: 'That feels complete. Now let us turn toward what your partner might be experiencing in this.',
        };
        yield { type: 'done' };
      }
      (getSonnetStreamingResponse as jest.Mock).mockReturnValue(llmStream());

      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { content: userMessage.content },
      });
      const { res, writeMock, endMock } = createMockResponse();

      await sendMessageStream(req as Request, res as Response);

      // AI message stays on stage 1 (no auto-advance)
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'AI',
            stage: 1,
          }),
        })
      );
      // Stage progress updated with feelHeardCheckOffered only — NOT completed
      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'progress-1' },
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              feelHeardCheckOffered: true,
            }),
          }),
        })
      );
      // No Stage 2 progress created by LLM path
      expect(prisma.stageProgress.upsert).not.toHaveBeenCalled();
      // No advancedToStage in SSE metadata
      const sseOutput = writeMock.mock.calls.map(([chunk]: [unknown]) => String(chunk)).join('');
      expect(sseOutput).not.toContain('"advancedToStage":2');
      expect(endMock).toHaveBeenCalled();
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
