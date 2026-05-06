import {
  Stage4ProposalKind,
  Stage4ProposalStatus,
} from '@meet-without-fear/shared';
import { prisma } from '../../lib/prisma';
import { refreshStage4NeedCoverage } from '../stage4-coverage.service';
import { captureStage4Turn } from '../stage4-capture.service';

jest.mock('../../lib/prisma');

const sessionId = 'session-1';
const userId = 'user-1';
const partnerId = 'user-2';

function need(overrides: Record<string, unknown> = {}) {
  return {
    id: 'need-1',
    need: 'connection after work',
    confirmed: true,
    createdAt: new Date('2026-05-06T12:00:00.000Z'),
    vessel: { userId },
    ...overrides,
  };
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proposal-1',
    sessionId,
    createdByUserId: userId,
    description: '10-minute connection after work check-in',
    needsAddressed: [],
    duration: null,
    measureOfSuccess: null,
    kind: Stage4ProposalKind.SHARED_PROPOSAL,
    status: Stage4ProposalStatus.ACTIVE,
    removedAt: null,
    removedByUserId: null,
    removalReason: null,
    updatedAt: new Date('2026-05-06T12:00:00.000Z'),
    ...overrides,
  };
}

function captureInput(overrides: Partial<Parameters<typeof captureStage4Turn>[0]> = {}) {
  return {
    sessionId,
    userId,
    messageId: 'message-1',
    userMessage: 'I can send a Sunday planning text each week for a month.',
    aiResponse: 'That is concrete enough to hold as an option.',
    ...overrides,
  };
}

describe('stage4-coverage.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('persists covered, partial, and open need coverage rows with proposal links', async () => {
    (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([
      need({
        id: 'need-covered',
        need: 'connection after work',
        vessel: { userId },
      }),
      need({
        id: 'need-partial',
        need: 'planning reliability',
        vessel: { userId: partnerId },
      }),
      need({
        id: 'need-open',
        need: 'quiet mornings',
        vessel: { userId },
      }),
    ]);
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        id: 'proposal-covered',
        description: '10-minute connection after work check-in',
      }),
      proposal({
        id: 'proposal-partial',
        description: 'Sunday planning text',
      }),
    ]);

    const result = await refreshStage4NeedCoverage(sessionId);

    expect(prisma.stage4NeedCoverage.deleteMany).toHaveBeenCalledWith({ where: { sessionId } });
    expect(prisma.stage4NeedCoverage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          needId: 'need-covered',
          sourceUserId: userId,
          coverageStatus: 'COVERED',
          coveringProposalIds: ['proposal-covered'],
        }),
        expect.objectContaining({
          needId: 'need-partial',
          sourceUserId: partnerId,
          coverageStatus: 'PARTIAL',
          coveringProposalIds: ['proposal-partial'],
        }),
        expect.objectContaining({
          needId: 'need-open',
          coverageStatus: 'OPEN',
          coveringProposalIds: [],
        }),
      ]),
    });
    expect(result).toEqual({ covered: 1, partial: 1, open: 1, total: 3 });
  });

  it('persists all needs as open when no active proposal covers them', async () => {
    (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([
      need({ id: 'need-1', need: 'quiet mornings' }),
      need({ id: 'need-2', need: 'predictability after school', vessel: { userId: partnerId } }),
    ]);
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([]);

    const result = await refreshStage4NeedCoverage(sessionId);

    expect(prisma.stage4NeedCoverage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          needId: 'need-1',
          coverageStatus: 'OPEN',
          coveringProposalIds: [],
        }),
        expect.objectContaining({
          needId: 'need-2',
          coverageStatus: 'OPEN',
          coveringProposalIds: [],
        }),
      ],
    });
    expect(result).toEqual({ covered: 0, partial: 0, open: 2, total: 2 });
  });

  it('refreshes coverage after add, revise, remove, and restore inventory changes', async () => {
    (prisma.strategyProposal.create as jest.Mock).mockResolvedValue({ id: 'created-proposal' });
    (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([need()]);

    (prisma.strategyProposal.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([proposal({ id: 'created-proposal' })]);

    await captureStage4Turn(captureInput());

    (prisma.strategyProposal.findMany as jest.Mock)
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([
        proposal({
          description: 'Sunday planning text for connection after work',
          status: Stage4ProposalStatus.REVISED,
        }),
      ]);

    await captureStage4Turn(
      captureInput({
        userMessage: 'Change that proposal to Sunday planning text for connection after work.',
      })
    );

    (prisma.strategyProposal.findMany as jest.Mock)
      .mockResolvedValueOnce([proposal()])
      .mockResolvedValueOnce([]);

    await captureStage4Turn(captureInput({ userMessage: 'Take that proposal off.' }));

    (prisma.strategyProposal.findMany as jest.Mock)
      .mockResolvedValueOnce([proposal({ status: Stage4ProposalStatus.REMOVED })])
      .mockResolvedValueOnce([proposal()]);

    await captureStage4Turn(captureInput({ userMessage: 'Restore that proposal.' }));

    expect(prisma.stage4NeedCoverage.deleteMany).toHaveBeenCalledTimes(4);
    expect(prisma.stage4NeedCoverage.createMany).toHaveBeenCalledTimes(4);
  });
});
