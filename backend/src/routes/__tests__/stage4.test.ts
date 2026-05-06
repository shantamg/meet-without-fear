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
import {
  AgreementStatus,
  AgreementType,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4Phase,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
  TendingEntryStatus,
  TendingEntryType,
} from '@meet-without-fear/shared';

// Mock prisma
jest.mock('../../lib/prisma');


// Mock realtime
jest.mock('../../services/realtime');


// Import controllers after mocks
import {
  getStage4State,
  getStrategies,
  proposeStrategy,
  submitRanking,
  markReady,
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

  describe('GET /sessions/:id/stage4 (getStage4State)', () => {
    it('returns redesigned inventory and initial phase for existing proposals', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: '2 weeks',
          measureOfSuccess: 'Both feel less surprised',
          kind: Stage4ProposalKind.SHARED_PROPOSAL,
          status: Stage4ProposalStatus.ACTIVE,
          createdByUserId: mockUser.id,
          updatedAt: new Date('2026-05-06T10:00:00.000Z'),
        },
        {
          id: mockStrategyIds[1],
          description: 'I will send the pickup plan by noon',
          needsAddressed: ['predictability'],
          duration: null,
          measureOfSuccess: null,
          kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
          status: Stage4ProposalStatus.ACTIVE,
          createdByUserId: mockUser.id,
          updatedAt: new Date('2026-05-06T10:01:00.000Z'),
        },
      ]);
      (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([]);

      await getStage4State(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: Stage4Phase.INVENTORY_BUILDING,
            partnerSelectionStatus: 'NOT_STARTED',
            outcome: null,
            inventory: expect.objectContaining({
              sharedProposals: [
                expect.objectContaining({
                  id: mockStrategyIds[0],
                  kind: Stage4ProposalKind.SHARED_PROPOSAL,
                  needsAddressed: [{ label: 'connection', coverage: 'COVERED' }],
                }),
              ],
              individualCommitments: [
                expect.objectContaining({
                  id: mockStrategyIds[1],
                  ownerLabel: 'You',
                }),
              ],
              removedProposalCount: 0,
            }),
          }),
        })
      );
    });

    it('represents a no-shared-agreement closure without agreements', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'I will keep weekends unscheduled',
          needsAddressed: ['autonomy'],
          duration: null,
          measureOfSuccess: null,
          kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
          status: Stage4ProposalStatus.ACTIVE,
          createdByUserId: mockUser.id,
          updatedAt: new Date('2026-05-06T10:00:00.000Z'),
        },
      ]);
      (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([
        {
          proposalId: mockStrategyIds[0],
          userId: mockUser.id,
          decision: Stage4SelectionDecision.WILLING,
          note: null,
          selectedAt: new Date('2026-05-06T10:02:00.000Z'),
          updatedAt: new Date('2026-05-06T10:02:00.000Z'),
        },
      ]);
      (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'coverage-open',
          needId: 'need-open',
          needLabel: 'shared predictability',
          sourceUserId: mockPartnerId,
          coverageStatus: 'OPEN',
          coveringProposalIds: [],
          note: 'Named as still open',
          updatedAt: new Date('2026-05-06T10:03:00.000Z'),
        },
      ]);
      (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue({
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
        reason: Stage4ClosureReason.NO_OVERLAP,
        summary: 'Closed with no shared obligation and one individual commitment.',
        sharedAgreementIds: [],
        individualProposalIds: [mockStrategyIds[0]],
        openNeedIds: ['need-open'],
        closedAt: new Date('2026-05-06T10:04:00.000Z'),
      });
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([]);

      await getStage4State(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: Stage4Phase.CLOSED_NO_SHARED_AGREEMENT,
            tendingPreview: expect.objectContaining({
              nextEntry: null,
              passiveReentryAvailable: true,
            }),
            outcome: expect.objectContaining({
              kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
              agreements: [],
              openNeeds: [
                expect.objectContaining({
                  id: 'need-open',
                  source: 'PARTNER',
                }),
              ],
            }),
          }),
        })
      );
    });

    it('hides partner proposal decisions until current user also submits selections', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: null,
          measureOfSuccess: null,
          kind: Stage4ProposalKind.SHARED_PROPOSAL,
          status: Stage4ProposalStatus.ACTIVE,
          createdByUserId: mockPartnerId,
          updatedAt: new Date('2026-05-06T10:00:00.000Z'),
        },
      ]);
      (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([
        {
          proposalId: mockStrategyIds[0],
          userId: mockPartnerId,
          decision: Stage4SelectionDecision.WILLING,
          note: 'Partner note stays private for now',
          selectedAt: new Date('2026-05-06T10:02:00.000Z'),
          updatedAt: new Date('2026-05-06T10:02:00.000Z'),
        },
      ]);
      (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([]);

      await getStage4State(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: Stage4Phase.SELECTION,
            partnerSelectionStatus: 'SUBMITTED',
            mySelections: [],
            inventory: expect.objectContaining({
              sharedProposals: [
                expect.not.objectContaining({
                  partnerDecisionVisible: Stage4SelectionDecision.WILLING,
                }),
              ],
            }),
          }),
        })
      );
    });

    it('returns coverage-review phase with covered, partial, and open needs', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: null,
          measureOfSuccess: null,
          kind: Stage4ProposalKind.SHARED_PROPOSAL,
          status: Stage4ProposalStatus.ACTIVE,
          createdByUserId: mockUser.id,
          updatedAt: new Date('2026-05-06T10:00:00.000Z'),
        },
      ]);
      (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'coverage-covered',
          needId: 'need-covered',
          needLabel: 'connection',
          sourceUserId: mockUser.id,
          coverageStatus: 'COVERED',
          coveringProposalIds: [mockStrategyIds[0]],
          note: 'Covered by weekly check-in',
          updatedAt: new Date('2026-05-06T10:03:00.000Z'),
        },
        {
          id: 'coverage-partial',
          needId: 'need-partial',
          needLabel: 'predictability',
          sourceUserId: mockPartnerId,
          coverageStatus: 'PARTIAL',
          coveringProposalIds: [mockStrategyIds[0]],
          note: 'Partly covered by the timing',
          updatedAt: new Date('2026-05-06T10:04:00.000Z'),
        },
        {
          id: 'coverage-open',
          needId: 'need-open',
          needLabel: 'repair after conflict',
          sourceUserId: null,
          coverageStatus: 'OPEN',
          coveringProposalIds: [],
          note: null,
          updatedAt: new Date('2026-05-06T10:05:00.000Z'),
        },
      ]);
      (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([]);

      await getStage4State(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: Stage4Phase.COVERAGE_REVIEW,
            coverageAudit: {
              covered: [
                expect.objectContaining({
                  id: 'need-covered',
                  source: 'YOU',
                  coveringProposalIds: [mockStrategyIds[0]],
                }),
              ],
              partial: [
                expect.objectContaining({
                  id: 'need-partial',
                  source: 'PARTNER',
                }),
              ],
              open: [
                expect.objectContaining({
                  id: 'need-open',
                  source: 'UNKNOWN',
                  note: null,
                }),
              ],
              updatedAt: '2026-05-06T10:05:00.000Z',
            },
            inventory: expect.objectContaining({
              unaddressedNeeds: [
                expect.objectContaining({
                  id: 'need-open',
                  note: 'Still open',
                }),
              ],
            }),
          }),
        })
      );
    });

    it('reveals partner decisions and returns outcome-review phase after both users submit selections', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: null,
          measureOfSuccess: null,
          kind: Stage4ProposalKind.SHARED_PROPOSAL,
          status: Stage4ProposalStatus.ACTIVE,
          createdByUserId: mockUser.id,
          updatedAt: new Date('2026-05-06T10:00:00.000Z'),
        },
      ]);
      (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([
        {
          proposalId: mockStrategyIds[0],
          userId: mockUser.id,
          decision: Stage4SelectionDecision.WILLING,
          note: 'Worth trying',
          selectedAt: new Date('2026-05-06T10:02:00.000Z'),
          updatedAt: new Date('2026-05-06T10:02:00.000Z'),
        },
        {
          proposalId: mockStrategyIds[0],
          userId: mockPartnerId,
          decision: Stage4SelectionDecision.NEEDS_DISCUSSION,
          note: 'Timing is still unclear',
          selectedAt: new Date('2026-05-06T10:03:00.000Z'),
          updatedAt: new Date('2026-05-06T10:03:00.000Z'),
        },
      ]);
      (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([]);

      await getStage4State(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: Stage4Phase.OUTCOME_REVIEW,
            partnerSelectionStatus: 'SUBMITTED',
            mySelections: [
              expect.objectContaining({
                proposalId: mockStrategyIds[0],
                decision: Stage4SelectionDecision.WILLING,
              }),
            ],
            inventory: expect.objectContaining({
              sharedProposals: [
                expect.objectContaining({
                  myDecision: Stage4SelectionDecision.WILLING,
                  partnerDecisionVisible: Stage4SelectionDecision.NEEDS_DISCUSSION,
                }),
              ],
            }),
          }),
        })
      );
    });

    it('returns closed shared-agreement outcome with the next Tending entry preview', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: '2 weeks',
          measureOfSuccess: 'We both know the plan by Friday',
          kind: Stage4ProposalKind.SHARED_PROPOSAL,
          status: Stage4ProposalStatus.CONVERTED_TO_AGREEMENT,
          createdByUserId: mockUser.id,
          updatedAt: new Date('2026-05-06T10:00:00.000Z'),
        },
      ]);
      (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([
        {
          proposalId: mockStrategyIds[0],
          userId: mockUser.id,
          decision: Stage4SelectionDecision.WILLING,
          note: null,
          selectedAt: new Date('2026-05-06T10:02:00.000Z'),
          updatedAt: new Date('2026-05-06T10:02:00.000Z'),
        },
        {
          proposalId: mockStrategyIds[0],
          userId: mockPartnerId,
          decision: Stage4SelectionDecision.WILLING,
          note: null,
          selectedAt: new Date('2026-05-06T10:03:00.000Z'),
          updatedAt: new Date('2026-05-06T10:03:00.000Z'),
        },
      ]);
      (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue({
        kind: Stage4ClosureKind.SHARED_AGREEMENT,
        reason: Stage4ClosureReason.MUTUAL_SELECTION,
        summary: 'Closed with one shared agreement.',
        sharedAgreementIds: ['agreement-1'],
        individualProposalIds: [],
        openNeedIds: [],
        closedAt: new Date('2026-05-06T10:04:00.000Z'),
      });
      (prisma.agreement.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'agreement-1',
          proposalId: mockStrategyIds[0],
          description: 'Weekly check-in',
          type: AgreementType.MICRO_EXPERIMENT,
          duration: '2 weeks',
          measureOfSuccess: 'We both know the plan by Friday',
          status: AgreementStatus.AGREED,
          agreedByA: true,
          agreedByB: true,
          agreedAt: new Date('2026-05-06T10:04:00.000Z'),
          followUpDate: new Date('2026-05-13T10:00:00.000Z'),
        },
      ]);
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'tending-1',
          type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
          status: TendingEntryStatus.SCHEDULED,
          agreementId: 'agreement-1',
          scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
          openedAt: null,
          completedAt: null,
          summary: 'Check whether the weekly check-in is helping.',
        },
      ]);

      await getStage4State(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: Stage4Phase.CLOSED_SHARED_AGREEMENT,
            outcome: expect.objectContaining({
              kind: Stage4ClosureKind.SHARED_AGREEMENT,
              agreements: [
                expect.objectContaining({
                  id: 'agreement-1',
                  strategyId: mockStrategyIds[0],
                  agreedByMe: true,
                  agreedByPartner: true,
                  followUpDate: '2026-05-13T10:00:00.000Z',
                }),
              ],
              closedAt: '2026-05-06T10:04:00.000Z',
            }),
            tendingPreview: {
              nextEntry: expect.objectContaining({
                id: 'tending-1',
                type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
                status: TendingEntryStatus.SCHEDULED,
                agreementId: 'agreement-1',
                scheduledFor: '2026-05-13T10:00:00.000Z',
              }),
              scheduledCount: 1,
              openCount: 0,
              passiveReentryAvailable: true,
            },
          }),
        })
      );
    });
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
      (prisma.stageProgress.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, stage: 4, gatesSatisfied: { readyToRank: true } },
        { userId: mockPartnerId, stage: 4, gatesSatisfied: null },
      ]);
      // Mock returns only the selected fields (as Prisma would with select clause)
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: '2 weeks',
          measureOfSuccess: 'Feel more connected',
          createdByUserId: mockUser.id,
        },
        {
          id: mockStrategyIds[1],
          description: 'Daily appreciation',
          needsAddressed: ['recognition'],
          duration: '1 week',
          measureOfSuccess: null,
          createdByUserId: mockUser.id,
        },
      ]);

      await getStrategies(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            myReadyToRank: true,
            partnerReadyToRank: false,
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

      // Verify Prisma can use createdByUserId for server-side visibility without exposing it
      expect(prisma.strategyProposal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            description: true,
            needsAddressed: true,
            duration: true,
            measureOfSuccess: true,
            createdByUserId: true,
          }),
        })
      );
    });

    it('does not return partner-only strategies while current user is still collecting', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, stage: 4, gatesSatisfied: null },
        { userId: mockPartnerId, stage: 4, gatesSatisfied: { readyToRank: true } },
      ]);
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Partner-only idea',
          needsAddressed: [],
          duration: null,
          measureOfSuccess: null,
          createdByUserId: mockPartnerId,
        },
      ]);
      (prisma.strategyRanking.findMany as jest.Mock).mockResolvedValue([]);

      await getStrategies(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: 'COLLECTING',
            strategies: [],
            canMarkReadyToRank: false,
            canRank: false,
          }),
        })
      );
    });

    it('returns revealing phase for a user who already submitted ranking while partner has not', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: mockSessionId },
      });
      const { res, statusMock, jsonMock } = createMockResponse();

      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession());
      (prisma.stageProgress.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, stage: 4, gatesSatisfied: { readyToRank: true, rankingSubmitted: true } },
        { userId: mockPartnerId, stage: 4, gatesSatisfied: { readyToRank: true } },
      ]);
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
        {
          id: mockStrategyIds[0],
          description: 'Weekly check-in',
          needsAddressed: ['connection'],
          duration: '2 weeks',
          measureOfSuccess: 'Feel more connected',
        },
      ]);
      (prisma.strategyRanking.findMany as jest.Mock).mockResolvedValue([
        { sessionId: mockSessionId, userId: mockUser.id, rankedIds: [mockStrategyIds[0]] },
      ]);

      await getStrategies(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            phase: 'REVEALING',
            myReadyToRank: true,
            partnerReadyToRank: true,
          }),
        })
      );
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
      (prisma.stageProgress.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, stage: 4, gatesSatisfied: { readyToRank: true } },
        { userId: mockPartnerId, stage: 4, gatesSatisfied: { readyToRank: true } },
      ]);
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue(
        rankedIds.map((id) => ({ id }))
      );
      (prisma.strategyProposal.count as jest.Mock).mockResolvedValue(1);
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
      (prisma.stageProgress.findMany as jest.Mock).mockResolvedValue([
        { userId: mockUser.id, stage: 4, gatesSatisfied: { readyToRank: true } },
        { userId: mockPartnerId, stage: 4, gatesSatisfied: { readyToRank: true } },
      ]);
      (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue(
        rankedIds.map((id) => ({ id }))
      );
      (prisma.strategyProposal.count as jest.Mock).mockResolvedValue(1);
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

  describe('POST /sessions/:id/strategies/ready (markReady)', () => {
    it('rejects readiness when current user has not contributed strategies', async () => {
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
      (prisma.strategyProposal.count as jest.Mock).mockResolvedValue(0);

      await markReady(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
      expect(prisma.stageProgress.update).not.toHaveBeenCalled();
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
