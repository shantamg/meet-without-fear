import {
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';
import { prisma } from '../../lib/prisma';
import { captureStage4Turn } from '../stage4-capture.service';

jest.mock('../../lib/prisma');

const sessionId = 'session-1';
const userId = 'user-1';
const messageId = 'message-1';

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proposal-1',
    sessionId,
    createdByUserId: userId,
    description: '10-minute check-in after dinner for one week',
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
    messageId,
    userMessage: 'I can send a Sunday planning text each week for a month.',
    aiResponse: 'That is concrete enough to hold as an option.',
    ...overrides,
  };
}

describe('stage4-capture.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.strategyProposal.create as jest.Mock).mockResolvedValue({
      id: 'created-proposal',
    });
  });

  it('adds individual commitments from first-person user phrasing', async () => {
    const result = await captureStage4Turn(captureInput());

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId,
        createdByUserId: userId,
        description: 'send a Sunday planning text each week for a month',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        status: Stage4ProposalStatus.ACTIVE,
        capturedFromMessageId: messageId,
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'created-proposal',
        action: 'CREATED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('keeps ProposedStrategy micro-tags as a compatibility add fallback', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That sounds right.',
        compatibilityProposedStrategies: ['10-minute check-in after dinner each night for one week'],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: '10-minute check-in after dinner each night for one week',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('removes a referenced proposal and records revision history', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([proposal()]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Take that proposal off.',
      })
    );

    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        status: Stage4ProposalStatus.REMOVED,
        removedByUserId: userId,
        removalReason: 'Take that proposal off.',
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'proposal-1',
        action: 'REMOVED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it.each([
    'That comes off the list',
    'Take that off',
    'Remove that one',
    "I'm taking it back",
    "Let's drop that",
  ])('removes a semantically referenced proposal for phrasing: %s', async (userMessage) => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'kids conversation negotiation after dinner for one week',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: `${userMessage}. I mean the kids conversation negotiation.`,
      })
    );

    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        status: Stage4ProposalStatus.REMOVED,
        removedByUserId: userId,
        removalReason: `${userMessage}. I mean the kids conversation negotiation.`,
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'proposal-1',
        action: 'REMOVED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('does not apply low-confidence destructive captures', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({ id: 'proposal-1', description: '10-minute check-in after dinner for one week' }),
      proposal({ id: 'proposal-2', description: 'Sunday planning text for a month' }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Remove that idea.',
      })
    );

    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(1);
  });

  it('captures willingness as a selection without creating an agreement', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([proposal()]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: "I'm willing to try that.",
      })
    );

    expect(prisma.stage4ProposalSelection.upsert).toHaveBeenCalledWith({
      where: {
        proposalId_userId: {
          proposalId: 'proposal-1',
          userId,
        },
      },
      create: expect.objectContaining({
        proposalId: 'proposal-1',
        userId,
        decision: Stage4SelectionDecision.WILLING,
      }),
      update: expect.objectContaining({
        decision: Stage4SelectionDecision.WILLING,
      }),
    });
    expect(prisma.agreement.create).not.toHaveBeenCalled();
    expect(result.selection?.decisions[0]?.decision).toBe(Stage4SelectionDecision.WILLING);
  });
});
