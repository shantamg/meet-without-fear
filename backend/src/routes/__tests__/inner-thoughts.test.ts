/**
 * Inner Thoughts Routes Tests
 *
 * Tests for inner thoughts (self-reflection) API endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import {
  createInnerWorkSession,
  listInnerWorkSessions,
  getInnerWorkSession,
  sendInnerWorkMessage,
  getInsights,
  dismissInsight,
  getInnerWorkOverview,
} from '../../controllers/inner-work';
import { prisma } from '../../lib/prisma';
import * as bedrock from '../../lib/bedrock';
import { ValidationError } from '../../middleware/errors';

// Mock Prisma
jest.mock('../../lib/prisma');

// Mock Bedrock
jest.mock('../../lib/bedrock');

// Mock embedding service
jest.mock('../../services/embedding', () => ({
  embedInnerWorkMessage: jest.fn().mockResolvedValue(undefined),
}));

// Mock conversation summarizer
jest.mock('../../services/conversation-summarizer', () => ({
  updateInnerThoughtsSummary: jest.fn().mockResolvedValue(undefined),
  getInnerThoughtsSummary: jest.fn().mockResolvedValue(null),
  formatInnerThoughtsSummaryForPrompt: jest.fn().mockReturnValue(''),
  INNER_THOUGHTS_SUMMARIZATION_CONFIG: { recentMessagesToKeep: 10 },
}));

// Mock memory detector
jest.mock('../../services/memory-detector', () => ({
  detectMemoryIntent: jest.fn().mockResolvedValue({
    hasMemoryIntent: false,
    suggestions: [],
  }),
}));

// Mock context retriever
jest.mock('../../services/context-retriever', () => ({
  retrieveContext: jest.fn().mockResolvedValue({
    conversationHistory: [],
    relevantFromOtherSessions: [],
    relevantFromCurrentSession: [],
    preSessionMessages: [],
    detectedReferences: [],
    retrievalSummary: '',
  }),
  formatRetrievedContext: jest.fn().mockReturnValue(''),
}));

// Helper to create mock request
function createMockRequest(options: {
  user?: {
    id: string;
    email: string;
    name: string | null;
    firstName?: string | null;
    clerkId?: string | null;
    pushToken?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
}): Request {
  return {
    user: options.user as Request['user'],
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
  } as Request;
}

// Helper to create mock response
function createMockResponse(): {
  res: Response;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

  return {
    res: {
      status: statusMock,
      json: jsonMock,
    } as unknown as Response,
    statusMock,
    jsonMock,
  };
}

// Helper to wait for async handler to complete
async function callHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response
): Promise<Error | null> {
  return new Promise((resolve) => {
    const next: NextFunction = (error?: unknown) => {
      resolve(error instanceof Error ? error : null);
    };
    handler(req, res, next);
    // Give async operations a chance to complete
    setTimeout(() => resolve(null), 100);
  });
}

describe('Inner Thoughts API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    firstName: 'Test',
    clerkId: 'clerk-123',
    pushToken: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /inner-thoughts (createInnerWorkSession)', () => {
    const mockSession = {
      id: 'session-123',
      userId: 'user-123',
      title: null,
      summary: null,
      theme: null,
      status: 'ACTIVE',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      linkedPartnerSessionId: null,
      _count: { messages: 0 },
    };

    const mockMessage = {
      id: 'msg-123',
      sessionId: 'session-123',
      role: 'AI',
      content: "Hey there. What's on your mind today?",
      timestamp: new Date('2024-01-01T00:00:01Z'),
    };

    it('creates session with AI greeting when no initialMessage provided', async () => {
      (prisma.innerWorkSession.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.innerWorkMessage.create as jest.Mock).mockResolvedValue(mockMessage);
      (bedrock.getCompletion as jest.Mock).mockResolvedValue(
        '{"response": "Hey there. What\'s on your mind today?"}'
      );

      const req = createMockRequest({
        user: mockUser,
        body: {},
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      const error = await callHandler(createInnerWorkSession, req, res);

      expect(error).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          session: expect.objectContaining({
            id: 'session-123',
            status: 'ACTIVE',
          }),
          initialMessage: expect.objectContaining({
            role: 'AI',
          }),
        },
      });

      // Should NOT have userMessage in response
      expect(jsonMock.mock.calls[0][0].data.userMessage).toBeUndefined();
    });

    it('creates session with user message first when initialMessage provided', async () => {
      const userMessage = {
        id: 'msg-user-123',
        sessionId: 'session-123',
        role: 'USER',
        content: 'I am feeling anxious about my relationship',
        timestamp: new Date('2024-01-01T00:00:00Z'),
      };

      const aiMessage = {
        id: 'msg-ai-123',
        sessionId: 'session-123',
        role: 'AI',
        content: 'I hear that you\'re feeling anxious. Tell me more.',
        timestamp: new Date('2024-01-01T00:00:01Z'),
      };

      (prisma.innerWorkSession.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.innerWorkMessage.create as jest.Mock)
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(aiMessage);
      (bedrock.getCompletion as jest.Mock).mockResolvedValue(
        '{"response": "I hear that you\'re feeling anxious. Tell me more."}'
      );

      const req = createMockRequest({
        user: mockUser,
        body: { initialMessage: 'I am feeling anxious about my relationship' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      const error = await callHandler(createInnerWorkSession, req, res);

      expect(error).toBeNull();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          session: expect.objectContaining({
            id: 'session-123',
            messageCount: 2,
          }),
          initialMessage: expect.objectContaining({
            role: 'AI',
          }),
          userMessage: expect.objectContaining({
            role: 'USER',
            content: 'I am feeling anxious about my relationship',
          }),
        },
      });

      // Verify user message was created first
      expect(prisma.innerWorkMessage.create).toHaveBeenCalledTimes(2);
      expect((prisma.innerWorkMessage.create as jest.Mock).mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          role: 'USER',
          content: 'I am feeling anxious about my relationship',
        })
      );
    });

    it('passes initialMessage to AI for response generation', async () => {
      const userMessage = {
        id: 'msg-user-123',
        sessionId: 'session-123',
        role: 'USER',
        content: 'Test message',
        timestamp: new Date(),
      };

      const aiMessage = {
        id: 'msg-ai-123',
        sessionId: 'session-123',
        role: 'AI',
        content: 'Response',
        timestamp: new Date(),
      };

      (prisma.innerWorkSession.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.innerWorkMessage.create as jest.Mock)
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(aiMessage);
      (bedrock.getCompletion as jest.Mock).mockResolvedValue('{"response": "Response"}');

      const req = createMockRequest({
        user: mockUser,
        body: { initialMessage: 'Test message' },
      });
      const { res } = createMockResponse();

      await callHandler(createInnerWorkSession, req, res);

      // Verify getCompletion was called with the user's message
      expect(bedrock.getCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test message' }],
        })
      );
    });

    it('validates initialMessage max length', async () => {
      const longMessage = 'a'.repeat(10001); // Exceeds 10000 limit

      const req = createMockRequest({
        user: mockUser,
        body: { initialMessage: longMessage },
      });
      const { res } = createMockResponse();

      const error = await callHandler(createInnerWorkSession, req, res);

      expect(error).toBeInstanceOf(ValidationError);
    });

    it('accepts valid title with initialMessage', async () => {
      const userMessage = {
        id: 'msg-user-123',
        sessionId: 'session-123',
        role: 'USER',
        content: 'My anxiety',
        timestamp: new Date(),
      };

      const aiMessage = {
        id: 'msg-ai-123',
        sessionId: 'session-123',
        role: 'AI',
        content: 'Response',
        timestamp: new Date(),
      };

      (prisma.innerWorkSession.create as jest.Mock).mockResolvedValue({
        ...mockSession,
        title: 'My Session',
      });
      (prisma.innerWorkMessage.create as jest.Mock)
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(aiMessage);
      (bedrock.getCompletion as jest.Mock).mockResolvedValue('{"response": "Response"}');

      const req = createMockRequest({
        user: mockUser,
        body: {
          title: 'My Session',
          initialMessage: 'My anxiety',
        },
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(createInnerWorkSession, req, res);

      expect(error).toBeNull();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          session: expect.objectContaining({
            title: 'My Session',
          }),
        }),
      });
    });
  });

  describe('GET /inner-thoughts (listInnerWorkSessions)', () => {
    it('lists user sessions', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          userId: 'user-123',
          title: 'Session 1',
          summary: null,
          theme: null,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedPartnerSessionId: null,
          _count: { messages: 5 },
        },
      ];

      (prisma.innerWorkSession.count as jest.Mock).mockResolvedValue(1);
      (prisma.innerWorkSession.findMany as jest.Mock).mockResolvedValue(mockSessions);

      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(listInnerWorkSessions, req, res);

      expect(error).toBeNull();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          sessions: expect.arrayContaining([
            expect.objectContaining({ id: 'session-1' }),
          ]),
          total: 1,
          hasMore: false,
        },
      });
    });
  });

  describe('GET /inner-thoughts/:id (getInnerWorkSession)', () => {
    it('returns session with messages', async () => {
      const mockSessionWithMessages = {
        id: 'session-123',
        userId: 'user-123',
        title: 'Test Session',
        summary: null,
        theme: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        linkedPartnerSessionId: null,
        messages: [
          {
            id: 'msg-1',
            role: 'AI',
            content: 'Hello',
            timestamp: new Date(),
          },
        ],
        _count: { messages: 1 },
      };

      (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue(mockSessionWithMessages);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-123' },
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(getInnerWorkSession, req, res);

      expect(error).toBeNull();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          session: expect.objectContaining({
            id: 'session-123',
            messages: expect.arrayContaining([
              expect.objectContaining({ id: 'msg-1', role: 'AI' }),
            ]),
          }),
        },
      });
    });

    it('throws error for non-existent session', async () => {
      (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const { res } = createMockResponse();

      const error = await callHandler(getInnerWorkSession, req, res);

      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('POST /inner-thoughts/:id/messages (sendInnerWorkMessage)', () => {
    const mockSession = {
      id: 'session-123',
      userId: 'user-123',
      title: null,
      summary: null,
      theme: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      linkedPartnerSessionId: null,
      messages: [
        {
          id: 'msg-1',
          role: 'AI',
          content: 'Hello',
          timestamp: new Date(),
        },
      ],
    };

    it('sends message and returns AI response', async () => {
      (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prisma.innerWorkSession.update as jest.Mock).mockResolvedValue(mockSession);
      (prisma.innerWorkMessage.create as jest.Mock)
        .mockResolvedValueOnce({
          id: 'msg-user',
          sessionId: 'session-123',
          role: 'USER',
          content: 'Hello AI',
          timestamp: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'msg-ai',
          sessionId: 'session-123',
          role: 'AI',
          content: 'Hello human',
          timestamp: new Date(),
        });
      (bedrock.getCompletion as jest.Mock).mockResolvedValue('{"response": "Hello human"}');

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-123' },
        body: { content: 'Hello AI' },
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(sendInnerWorkMessage, req, res);

      expect(error).toBeNull();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          userMessage: expect.objectContaining({
            role: 'USER',
            content: 'Hello AI',
          }),
          aiMessage: expect.objectContaining({
            role: 'AI',
            content: 'Hello human',
          }),
          memorySuggestion: null,
        },
      });
    });

    it('rejects message to non-active session', async () => {
      (prisma.innerWorkSession.findFirst as jest.Mock).mockResolvedValue({
        ...mockSession,
        status: 'ARCHIVED',
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'session-123' },
        body: { content: 'Hello' },
      });
      const { res } = createMockResponse();

      const error = await callHandler(sendInnerWorkMessage, req, res);

      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('GET /inner-work/insights (getInsights)', () => {
    const mockInsights = [
      {
        id: 'insight-1',
        userId: 'user-123',
        type: 'PATTERN',
        summary: 'You mention work stress frequently',
        data: {
          title: 'Work Stress Pattern',
          description: 'Recurring mentions of work-related stress',
          confidence: 0.85,
          evidence: ['Session 1', 'Session 3'],
        },
        priority: 8,
        dismissed: false,
        expiresAt: null,
        createdAt: new Date('2024-01-15T00:00:00Z'),
      },
      {
        id: 'insight-2',
        userId: 'user-123',
        type: 'SUGGESTION',
        summary: 'Consider trying meditation',
        data: {
          title: 'Meditation Suggestion',
          suggestedAction: 'Try a 5-minute guided meditation',
        },
        priority: 5,
        dismissed: false,
        expiresAt: new Date('2024-02-01T00:00:00Z'),
        createdAt: new Date('2024-01-14T00:00:00Z'),
      },
    ];

    it('returns user insights sorted by priority', async () => {
      (prisma.insight.findMany as jest.Mock).mockResolvedValue(mockInsights);

      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(getInsights, req, res);

      expect(error).toBeNull();
      expect(prisma.insight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
            dismissed: false,
          }),
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        })
      );
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          insights: expect.arrayContaining([
            expect.objectContaining({ id: 'insight-1', type: 'PATTERN' }),
            expect.objectContaining({ id: 'insight-2', type: 'SUGGESTION' }),
          ]),
          hasMore: false,
        },
      });
    });

    it('filters by type when specified', async () => {
      (prisma.insight.findMany as jest.Mock).mockResolvedValue([mockInsights[0]]);

      const req = createMockRequest({
        user: mockUser,
        query: { type: 'PATTERN' },
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(getInsights, req, res);

      expect(error).toBeNull();
      expect(prisma.insight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'PATTERN',
          }),
        })
      );
    });

    it('includes dismissed insights when requested', async () => {
      const allInsights = [
        ...mockInsights,
        { ...mockInsights[0], id: 'insight-3', dismissed: true },
      ];
      (prisma.insight.findMany as jest.Mock).mockResolvedValue(allInsights);

      const req = createMockRequest({
        user: mockUser,
        query: { includeDismissed: 'true' },
      });
      const { res } = createMockResponse();

      await callHandler(getInsights, req, res);

      expect(prisma.insight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            dismissed: false,
          }),
        })
      );
    });

    it('returns hasMore when more insights available', async () => {
      // Create 21 insights to trigger hasMore
      const manyInsights = Array(21)
        .fill(null)
        .map((_, i) => ({
          ...mockInsights[0],
          id: `insight-${i}`,
        }));
      (prisma.insight.findMany as jest.Mock).mockResolvedValue(manyInsights);

      const req = createMockRequest({
        user: mockUser,
        query: { limit: '20' },
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(getInsights, req, res);

      expect(error).toBeNull();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          insights: expect.any(Array),
          hasMore: true,
        },
      });
    });
  });

  describe('POST /inner-work/insights/:id/dismiss (dismissInsight)', () => {
    const mockInsight = {
      id: 'insight-1',
      userId: 'user-123',
      type: 'PATTERN',
      summary: 'Test insight',
      data: {},
      priority: 5,
      dismissed: false,
      expiresAt: null,
      createdAt: new Date(),
    };

    it('dismisses an insight successfully', async () => {
      (prisma.insight.findFirst as jest.Mock).mockResolvedValue(mockInsight);
      (prisma.insight.update as jest.Mock).mockResolvedValue({
        ...mockInsight,
        dismissed: true,
      });

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'insight-1' },
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(dismissInsight, req, res);

      expect(error).toBeNull();
      expect(prisma.insight.update).toHaveBeenCalledWith({
        where: { id: 'insight-1' },
        data: { dismissed: true },
      });
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: { success: true },
      });
    });

    it('throws error for non-existent insight', async () => {
      (prisma.insight.findFirst as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const { res } = createMockResponse();

      const error = await callHandler(dismissInsight, req, res);

      expect(error).toBeInstanceOf(ValidationError);
    });

    it('throws error for insight belonging to another user', async () => {
      (prisma.insight.findFirst as jest.Mock).mockResolvedValue(null); // Query with userId filter returns null

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'insight-other-user' },
      });
      const { res } = createMockResponse();

      const error = await callHandler(dismissInsight, req, res);

      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('GET /inner-work/overview (getInnerWorkOverview)', () => {
    const mockInsights = [
      {
        id: 'insight-1',
        userId: 'user-123',
        type: 'PATTERN',
        summary: 'Test pattern',
        data: { title: 'Pattern' },
        priority: 8,
        dismissed: false,
        expiresAt: null,
        createdAt: new Date('2024-01-15T00:00:00Z'),
      },
    ];

    it('returns overview with recent insights', async () => {
      (prisma.insight.findMany as jest.Mock).mockResolvedValue(mockInsights);

      const req = createMockRequest({
        user: mockUser,
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(getInnerWorkOverview, req, res);

      expect(error).toBeNull();
      expect(prisma.insight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
            dismissed: false,
          }),
          take: 5,
        })
      );
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          overview: expect.objectContaining({
            recentInsights: expect.arrayContaining([
              expect.objectContaining({ id: 'insight-1', type: 'PATTERN' }),
            ]),
          }),
        },
      });
    });

    it('returns empty insights when none exist', async () => {
      (prisma.insight.findMany as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        user: mockUser,
      });
      const { res, jsonMock } = createMockResponse();

      const error = await callHandler(getInnerWorkOverview, req, res);

      expect(error).toBeNull();
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          overview: expect.objectContaining({
            recentInsights: [],
          }),
        },
      });
    });
  });
});
