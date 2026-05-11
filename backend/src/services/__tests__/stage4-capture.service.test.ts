import {
  Stage4ClosureKind,
  Stage4ClosureReason,
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

  it('does not turn observations into individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I can see the trip and curiosity pieces matter for Eve.',
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('does not turn caveats into individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'If even that becomes too much, then I would worry this is still only theoretical.',
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('keeps ProposedStrategy micro-tags as a compatibility add fallback', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That sounds right.',
        compatibilityProposedStrategies: ['10-minute check-in after dinner each night for one week'],
      })
    );

    // Legacy compatibility fallback defaults to INDIVIDUAL_COMMITMENT when no
    // generic shared/individual signal is present — never auto-promote an
    // ambiguous fragment to SHARED. Typed <stage4_proposals> output is the
    // authoritative source for `kind`.
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: '10-minute check-in after dinner each night for one week',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('trusts typed structured Stage 4 proposal classifications over text inference', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage:
          'I can own that I got sharp sometimes. What I would actually try is one quiet conversation this Friday without the kids in the room.',
        structuredProposals: [
          {
            action: 'IGNORE',
            classification: 'REFLECTION',
            description: 'I can own that I got sharp sometimes',
            kind: undefined,
            ownerUserId: undefined,
          },
          {
            action: 'ADD',
            classification: 'PROPOSAL',
            description: 'one quiet conversation this Friday without the kids in the room',
            kind: Stage4ProposalKind.SHARED_PROPOSAL,
            ownerUserId: undefined,
            duration: 'this Friday',
            measureOfSuccess: 'leave with an actual answer',
          },
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'one quiet conversation this Friday without the kids in the room',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
        duration: 'this Friday',
        measureOfSuccess: 'leave with an actual answer',
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('does not use compatibility or first-person fallback when typed Stage 4 block is present', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I can send a Sunday planning text each week for a month.',
        structuredProposals: [],
        compatibilityProposedStrategies: ['Sunday planning text each week for a month'],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('uses typed Stage 4 revise actions against existing proposal ids', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        id: 'proposal-1',
        description: 'one quiet conversation this week',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Make it this Friday, without the kids in the room.',
        structuredProposals: [
          {
            action: 'REVISE',
            targetProposalId: 'proposal-1',
            classification: 'PROPOSAL',
            description: 'one quiet conversation this Friday without the kids in the room',
            kind: Stage4ProposalKind.SHARED_PROPOSAL,
            duration: 'this Friday',
          },
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description: 'one quiet conversation this Friday without the kids in the room',
        duration: 'this Friday',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('normalizes parenthetical proposal kind labels from compatibility tags', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Saturday morning alone in garage or on a project to practice feeling steady independently (individual commitment)',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Saturday morning alone in garage or on a project to practice feeling steady independently',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
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

  it('revises a misclassified shared proposal to an individual commitment', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'two hours on Saturday mornings for four weeks doing something I build or make',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage:
          'Small adjustment: the Saturday morning making/building idea should be individual for me, not shared. Eve does not need to participate or approve it.',
      })
    );

    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
        status: Stage4ProposalStatus.ACTIVE,
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'proposal-1',
        action: 'REVISED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('captures pre-mutation before-snapshot when revising a superseded proposal', async () => {
    const originalSnapshot = {
      description:
        "weekly conversation where Eve names one thing she is wanting or curious about, and Adam's first job is to ask what it means to her",
      needsAddressed: ['need-original'],
      duration: 'one week',
      measureOfSuccess: 'felt heard',
      kind: Stage4ProposalKind.SHARED_PROPOSAL,
      status: Stage4ProposalStatus.ACTIVE,
    };
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([proposal({ ...originalSnapshot })]);

    await captureStage4Turn(
      captureInput({
        userMessage:
          "I think I could try a weekly conversation where I name one thing I am wanting or curious about, and Adam's first job is just to ask what it means to me before defending what we already have.",
      })
    );

    const revisionCall = (prisma.stage4ProposalRevision.create as jest.Mock).mock.calls.find(
      ([args]) => args?.data?.action === 'REVISED'
    );
    expect(revisionCall).toBeDefined();
    const { before, after } = revisionCall![0].data;
    expect(before).toEqual(
      expect.objectContaining({
        description: originalSnapshot.description,
        needsAddressed: originalSnapshot.needsAddressed,
        duration: originalSnapshot.duration,
        measureOfSuccess: originalSnapshot.measureOfSuccess,
        kind: originalSnapshot.kind,
        status: originalSnapshot.status,
      })
    );
    expect(before).not.toEqual(after);
    expect(after).toEqual(
      expect.objectContaining({
        description:
          "try a weekly conversation where I name one thing I am wanting or curious about, and Adam's first job is just to ask what it means to me before defending what we already have",
      })
    );
  });

  it('revises semantically superseded proposal drafts instead of adding duplicates', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "weekly conversation where Eve names one thing she is wanting or curious about, and Adam's first job is to ask what it means to her",
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage:
          "I think I could try a weekly conversation where I name one thing I am wanting or curious about, and Adam's first job is just to ask what it means to me before defending what we already have.",
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          "try a weekly conversation where I name one thing I am wanting or curious about, and Adam's first job is just to ask what it means to me before defending what we already have",
        status: Stage4ProposalStatus.ACTIVE,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it.each([
    'That feels complete for now. I do not want to add more just to make this feel more hopeful than it is.',
    'This feels like the right place to close. I do not want to ask what he might try.',
  ])('captures bounded no-shared closure language: %s', async (userMessage) => {
    const result = await captureStage4Turn(captureInput({ userMessage }));

    expect(result.closureSignal).toEqual(
      expect.objectContaining({
        readyToClose: true,
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
      })
    );
  });

  it('rejects structured proposals that restate the topic frame', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'ok sure',
        topicFrame: "Shantam's son defecates on Darryl's lawn",
        structuredProposals: [
          {
            action: 'ADD',
            classification: 'PROPOSAL',
            description: "When his son does defecate on Darryl's lawn, Shantam cleans it up immediately",
            kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
            ownerUserId: userId,
            needsAddressed: [],
          },
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('allows proposals that do not restate the topic frame', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I can send a Sunday planning text each week for a month.',
        topicFrame: "Shantam's son defecates on Darryl's lawn",
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(1);
  });

  it('does not treat complete-enough-to-start language as a closure signal', async () => {
    const result = await captureStage4Turn(captureInput({
      userMessage: 'That feels complete enough to start. I am nervous, but this list feels small enough that I could actually try it.',
    }));

    expect(result.closureSignal).toBeUndefined();
  });
});
