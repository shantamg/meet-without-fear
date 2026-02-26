/**
 * Stage 4 API Tests
 *
 * Tests for the Strategic Repair stage endpoints:
 * - GET /sessions/:id/strategies - Get anonymous strategy pool
 * - POST /sessions/:id/strategies - Propose a strategy
 * - POST /sessions/:id/strategies/rank - Submit ranking
 * - GET /sessions/:id/strategies/overlap - Get ranking overlap
 * - POST /sessions/:id/agreements - Create agreement
 * - POST /sessions/:id/agreements/:agreementId/confirm - Confirm agreement
 */

import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { notifyPartner, publishSessionEvent } from '../../services/realtime';

// Mock prisma
jest.mock('../../lib/prisma');


// Mock realtime
jest.mock('../../services/realtime');


// Import controllers after mocks
import {
  getStrategies,
  proposeStrategy,
  submitRanking,
  getOverlap,
  createAgreement,
  confirmAgreement,
} from '../../controllers/stage4';

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

// Helper to create mock session
function mockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clsession00001',
    status: 'ACTIVE',
    relationship: {
      members: [
        { userId: 'clusertest00001', joinedAt: new Date('2024-01-01') },
        { userId: 'clpartner00001', joinedAt: new Date('2024-01-02') },
      ],
    },
    ...overrides,
  };
}

describe('Stage 4 API', () => {
  const mockUser = { id: 'clusertest00001', email: 'test@example.com', name: 'Test User' };
  const mockSessionId = 'clsession00001';
  const mockPartnerId = 'clpartner00001';
  const mockStrategyIds = ['clstrat000001', 'clstrat000002', 'clstrat000003', 'clstrat000004'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /sessions/:id/strategies (getStrategies)', () => {
    it('returns unlabeled strategy pool', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      });
      // Mock returns only the selected fields (as Prisma would with select clause)
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: '2 weeks',
          measureOfSuccess: 'Feel more connected',
          // Note: createdByUserId is NOT returned due to Prisma select
        },
        {
          id: mockStrategyIds[1],
          description: 'Daily appreciation',
          needsAddressed: ['recognition'],
          duration: '1 week',
          measureOfSuccess: null,
          // Note: createdByUserId is NOT returned due to Prisma select
        },
      ]);

      await getStrategies(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            strategies: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                description: expect.any(String),
              }),
            ]),
          }),
        })
      );

      // Verify strategies don't expose createdBy
      const responseData = jsonMock.mock.calls[0][0];
      responseData.data.strategies.forEach((strategy: Record<string, unknown>) => {
        expect(strategy).not.toHaveProperty('createdBy');
        expect(strategy).not.toHaveProperty('createdByUserId');
      });

      // Verify Prisma was called with select that excludes createdByUserId
      expect(prisma.strategyProposal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            description: true,
            needsAddressed: true,
            duration: true,
            measureOfSuccess: true,
          }),
        })
      );
      // Verify createdByUserId is NOT in the select
      const findManyCall = (prisma.strategyProposal.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.select.createdByUserId).toBeUndefined();
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await getStrategies(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        })
      );
    });

    it('returns 404 when session not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      await getStrategies(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });
  });

  describe('POST /sessions/:id/strategies (proposeStrategy)', () => {
    it('adds user strategy to pool', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          description: 'We could try having a weekly check-in',
          needsAddressed: ['connection', 'safety'],
          duration: '2 weeks',
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      });
      (prisma.strategyProposal.create as jest.Mock).mockResolvedValue({
        id: 'strat-new',
        description: 'We could try having a weekly check-in',
        needsAddressed: ['connection', 'safety'],
        duration: '2 weeks',
        measureOfSuccess: null,
        createdAt: new Date(),
      });

      await proposeStrategy(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            strategy: expect.objectContaining({
              id: 'strat-new',
              description: 'We could try having a weekly check-in',
            }),
          }),
        })
      );

      expect(prisma.strategyProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: mockSessionId,
            createdByUserId: mockUser.id,
            description: 'We could try having a weekly check-in',
            needsAddressed: ['connection', 'safety'],
            duration: '2 weeks',
            source: 'USER_SUBMITTED',
          }),
        })
      );
    });

    it('validates description is long enough', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          description: 'short', // Less than 10 characters
          needsAddressed: ['connection'],
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await proposeStrategy(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('requires at least one need to be addressed', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          description: 'A valid description here',
          needsAddressed: [], // Empty array
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await proposeStrategy(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });

    it('rejects if user not in stage 4', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          description: 'A valid description here',
          needsAddressed: ['connection'],
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 3, // Not stage 4
        status: 'IN_PROGRESS',
      });

      await proposeStrategy(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });
  });

  describe('POST /sessions/:id/strategies/rank (submitRanking)', () => {
    it('stores private ranking', async () => {
      const rankedIds = [mockStrategyIds[0], mockStrategyIds[1], mockStrategyIds[2]];
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { rankedIds },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      });
      (prisma.strategyRanking.upsert as jest.Mock).mockResolvedValue({
        id: 'clranking0001',
        rankedIds,
        submittedAt: new Date(),
      });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        gatesSatisfied: { rankingSubmitted: true },
      });
      // Mock partner ranking check - partner has not ranked yet
      (prisma.strategyRanking.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, rankedIds },
      ]);

      await submitRanking(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            ranked: true,
            partnerRanked: false,
          }),
        })
      );

      expect(prisma.strategyRanking.upsert).toHaveBeenCalled();
      expect(prisma.stageProgress.update).toHaveBeenCalled();
      expect(notifyPartner).toHaveBeenCalled();
    });

    it('indicates when partner has also ranked', async () => {
      const rankedIds = [mockStrategyIds[0], mockStrategyIds[1], mockStrategyIds[2]];
      const partnerRankedIds = [mockStrategyIds[1], mockStrategyIds[0], mockStrategyIds[2]];
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { rankedIds },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
        gatesSatisfied: {},
      });
      (prisma.strategyRanking.upsert as jest.Mock).mockResolvedValue({
        id: 'clranking0001',
        rankedIds,
        submittedAt: new Date(),
      });
      (prisma.stageProgress.update as jest.Mock).mockResolvedValue({
        gatesSatisfied: { rankingSubmitted: true },
      });
      // Mock partner ranking check - partner HAS ranked
      (prisma.strategyRanking.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, rankedIds },
        { userId: mockPartnerId, rankedIds: partnerRankedIds },
      ]);

      await submitRanking(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            ranked: true,
            partnerRanked: true,
            canReveal: true,
          }),
        })
      );
    });

    it('requires at least one strategy to be ranked', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: { rankedIds: [] },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await submitRanking(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    });
  });

  describe('GET /sessions/:id/strategies/overlap (getOverlap)', () => {
    it('returns null overlap when waiting for partner', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
      });
      // Only user has ranked, partner has not
      (prisma.strategyRanking.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, rankedIds: [mockStrategyIds[0], mockStrategyIds[1], mockStrategyIds[2]] },
      ]);

      await getOverlap(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            overlap: null,
            waitingForPartner: true,
          }),
        })
      );
    });

    it('returns overlap calculation when both have ranked', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
      });
      // Both have ranked with some overlap
      (prisma.strategyRanking.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, rankedIds: [mockStrategyIds[0], mockStrategyIds[1], mockStrategyIds[2]] },
        { userId: mockPartnerId, rankedIds: [mockStrategyIds[1], mockStrategyIds[0], mockStrategyIds[3]] },
      ]);
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        { id: mockStrategyIds[0], description: 'Strategy 1' },
        { id: mockStrategyIds[1], description: 'Strategy 2' },
      ]);

      await getOverlap(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            overlap: expect.any(Array),
            waitingForPartner: false,
          }),
        })
      );
    });
  });

  describe('POST /sessions/:id/agreements (createAgreement)', () => {
    it('creates agreement from top strategy', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
        body: {
          strategyId: mockStrategyIds[0],
          description: 'We will have weekly check-ins',
          type: 'MICRO_EXPERIMENT',
          followUpDate: '2024-02-01',
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
      });
      (prisma.strategyProposal.findUnique as jest.Mock).mockResolvedValue({
        id: mockStrategyIds[0],
        sessionId: mockSessionId,
        description: 'Weekly check-in',
      });
      (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({
        id: 'clvessel00001',
        sessionId: mockSessionId,
      });
      (prisma.agreement.create as jest.Mock).mockResolvedValue({
        id: 'clagreement01',
        description: 'We will have weekly check-ins',
        type: 'MICRO_EXPERIMENT',
        status: 'PROPOSED',
        agreedByA: true,
        agreedByB: false,
        followUpDate: new Date('2024-02-01'),
      });

      await createAgreement(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            agreement: expect.objectContaining({
              id: 'clagreement01',
              status: 'PROPOSED',
            }),
            awaitingPartnerConfirmation: true,
          }),
        })
      );

      expect(prisma.agreement.create).toHaveBeenCalled();
      expect(notifyPartner).toHaveBeenCalled();
    });

    it('requires authentication', async () => {
      const req = createMockRequest({
        params: { id: mockSessionId },
        body: {
          description: 'We will have weekly check-ins',
          type: 'MICRO_EXPERIMENT',
        },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      await createAgreement(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('POST /sessions/:id/agreements/:agreementId/confirm (confirmAgreement)', () => {
    it('confirms agreement when partner agrees', async () => {
      const req = createMockRequest({
        user: { id: mockPartnerId, email: 'partner@example.com', name: 'Partner' },
        params: { id: mockSessionId, agreementId: 'clagreement01' },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
      });
      (prisma.agreement.findUnique as jest.Mock).mockResolvedValue({
        id: 'clagreement01',
        sharedVesselId: 'clvessel00001',
        description: 'Weekly check-in',
        type: 'MICRO_EXPERIMENT',
        status: 'PROPOSED',
        agreedByA: true,
        agreedByB: false,
        sharedVessel: {
          sessionId: mockSessionId,
        },
      });
      (prisma.agreement.update as jest.Mock).mockResolvedValue({
        id: 'clagreement01',
        description: 'Weekly check-in',
        type: 'MICRO_EXPERIMENT',
        status: 'AGREED',
        agreedByA: true,
        agreedByB: true,
        agreedAt: new Date(),
      });
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([{
        id: 'clagreement01',
        agreedByA: true,
        agreedByB: true,
      }]);

      await confirmAgreement(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            agreement: expect.objectContaining({
              agreedByMe: true,
              agreedByPartner: true,
              status: 'AGREED',
            }),
            sessionCanResolve: true,
          }),
        })
      );

      expect(prisma.agreement.update).toHaveBeenCalled();
    });

    it('marks agreement declined when confirmed: false', async () => {
      const req = createMockRequest({
        user: { id: mockPartnerId, email: 'partner@example.com', name: 'Partner' },
        params: { id: mockSessionId, agreementId: 'clagreement01' },
        body: { confirmed: false },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
      });
      (prisma.agreement.findUnique as jest.Mock).mockResolvedValue({
        id: 'clagreement01',
        sharedVesselId: 'clvessel00001',
        description: 'Weekly check-in',
        type: 'MICRO_EXPERIMENT',
        status: 'PROPOSED',
        agreedByA: true,
        agreedByB: false,
        sharedVessel: {
          sessionId: mockSessionId,
        },
      });
      (prisma.agreement.update as jest.Mock).mockResolvedValue({
        id: 'clagreement01',
        description: 'Weekly check-in',
        type: 'MICRO_EXPERIMENT',
        status: 'PROPOSED', // Stays proposed for renegotiation
        agreedByA: true,
        agreedByB: false,
      });
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([{
        id: 'clagreement01',
        agreedByA: true,
        agreedByB: false,
      }]);

      await confirmAgreement(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            agreement: expect.objectContaining({
              agreedByMe: false,
              agreedByPartner: true,
              status: 'PROPOSED',
            }),
            sessionCanResolve: false,
          }),
        })
      );
    });

    it('returns 404 if agreement not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId, agreementId: 'clnonexistent' },
        body: { confirmed: true },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({
        stage: 4,
        status: 'IN_PROGRESS',
      });
      (prisma.agreement.findUnique as jest.Mock).mockResolvedValue(null);

      await confirmAgreement(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'NOT_FOUND' }),
        })
      );
    });
  });
});
