import {
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4ProposalKind,
  Stage4ProposalStatus,
} from '@meet-without-fear/shared';
import { prisma } from '../../lib/prisma';
import { notifyPartner, publishSessionEvent } from '../realtime';
import { applyStage4AutoClosureFromSignal } from '../stage4-auto-closure.service';

jest.mock('../../lib/prisma');
jest.mock('../realtime');

const sessionId = 'session-1';
const userId = 'user-1';
const partnerId = 'user-2';

describe('stage4-auto-closure.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores missing or non-explicit closure signals', async () => {
    const result = await applyStage4AutoClosureFromSignal({
      sessionId,
      userId,
    });

    expect(result).toEqual({ closed: false, reason: 'no_explicit_no_shared_closure_signal' });
    expect(prisma.stage4Closure.create).not.toHaveBeenCalled();
  });

  it('closes Stage 4 for both partners on explicit no-shared-agreement signal', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      status: 'ACTIVE',
      relationship: {
        members: [
          { userId, joinedAt: new Date('2026-05-07T10:00:00.000Z') },
          { userId: partnerId, joinedAt: new Date('2026-05-07T10:01:00.000Z') },
        ],
      },
    });
    (prisma.stageProgress.findFirst as jest.Mock).mockResolvedValue({ stage: 4 });
    (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'individual-1',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        status: Stage4ProposalStatus.ACTIVE,
        createdByUserId: userId,
      },
      {
        id: 'shared-1',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
        status: Stage4ProposalStatus.ACTIVE,
        createdByUserId: partnerId,
      },
    ]);
    (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([
      { id: 'coverage-open', needId: 'need-open', coverageStatus: 'OPEN' },
    ]);
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      relationship: {
        members: [
          { userId },
          { userId: partnerId },
        ],
      },
    });

    const result = await applyStage4AutoClosureFromSignal({
      sessionId,
      userId,
      signal: {
        readyToClose: true,
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
        reason: Stage4ClosureReason.USER_STOPPED,
        summary: 'I want to close here.',
      },
    });

    expect(result).toEqual({ closed: true, reason: Stage4ClosureReason.USER_STOPPED });
    expect(prisma.stage4Closure.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId,
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
        reason: Stage4ClosureReason.USER_STOPPED,
        summary: 'I want to close here.',
        sharedAgreementIds: [],
        individualProposalIds: ['individual-1'],
        openNeedIds: ['need-open'],
        closedByUserId: userId,
      }),
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: sessionId },
      data: expect.objectContaining({ status: 'RESOLVED' }),
    });
    expect(prisma.stageProgress.updateMany).toHaveBeenCalledWith({
      where: { sessionId, completedAt: null },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
    expect(notifyPartner).toHaveBeenCalledWith(
      sessionId,
      partnerId,
      'session.resolved',
      expect.objectContaining({ kind: Stage4ClosureKind.NO_SHARED_AGREEMENT })
    );
    expect(publishSessionEvent).toHaveBeenCalledWith(
      sessionId,
      'session.resolved',
      expect.objectContaining({ closureKind: Stage4ClosureKind.NO_SHARED_AGREEMENT })
    );
  });
});
