import { prisma } from '../../lib/prisma';
import { publishSessionEvent } from '../realtime';
import {
  createPassiveReentry,
  listTendingEntries,
  listTendingCoordinationCycles,
  openDueTendingEntries,
  publishPartnerInvolvingReentryChoice,
  recommendTendingNextAction,
  resolveReadyTendingCoordinationCycles,
  resolveTimedOutTendingCoordinationCycles,
  scheduleIndividualCommitmentTendingEntries,
  scheduleSharedAgreementTendingEntries,
  setIndividualEntryShare,
  submitTendingCheckin,
  submitTendingResponse,
  TendingForbiddenError,
  TendingInvalidStateError,
} from '../tending.service';
import {
  ContinueChoice,
  PartialClosureResolution,
  TendingBlockerCategory,
  TendingCoordinationStatus,
  TendingEntryScope,
  TendingEntryStatus,
  TendingEntryType,
  TendingFollowThroughStatus,
  TendingHelpfulnessStatus,
  TendingNeedResolutionStatus,
  TendingNextAction,
  TendingReminderScope,
} from '@meet-without-fear/shared';

jest.mock('../../lib/prisma');
jest.mock('../realtime');

describe('tending.service', () => {
  const sessionId = 'session-1';
  const userId = 'user-1';
  const partnerId = 'user-2';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules shared agreement check-ins only when agreements have follow-up timing', async () => {
    (prisma.tendingEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'tending-1' });

    const ids = await scheduleSharedAgreementTendingEntries(
      prisma as any,
      sessionId,
      [
        {
          id: 'agreement-1',
          description: 'Check in every Friday',
          followUpDate: new Date('2026-05-13T10:00:00.000Z'),
        },
        {
          id: 'agreement-2',
          description: 'No timing yet',
          followUpDate: null,
        },
      ],
      new Date('2026-05-06T10:00:00.000Z')
    );

    expect(ids).toEqual(['tending-1']);
    expect(prisma.tendingEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.tendingEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId,
        agreementId: 'agreement-1',
        type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
        status: TendingEntryStatus.SCHEDULED,
        scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
      }),
    });
  });

  it('lists entries with only the current user response expanded as myResponse', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      status: 'RESOLVED',
      relationship: { members: [{ userId }, { userId: partnerId }] },
    });
    (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'tending-1',
        sessionId,
        agreementId: 'agreement-1',
        type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
        status: TendingEntryStatus.PARTIAL,
        scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
        openedAt: new Date('2026-05-13T10:00:00.000Z'),
        completedAt: null,
        summary: 'Check in',
        createdAt: new Date('2026-05-06T10:00:00.000Z'),
        updatedAt: new Date('2026-05-13T10:01:00.000Z'),
        responses: [
          {
            id: 'response-1',
            tendingEntryId: 'tending-1',
            userId,
            status: 'WORKED',
            reflection: 'Better than last week',
            continueChoice: ContinueChoice.EXTEND,
            submittedAt: new Date('2026-05-13T10:02:00.000Z'),
          },
          {
            id: 'response-2',
            tendingEntryId: 'tending-1',
            userId: partnerId,
            status: 'PARTLY',
            reflection: null,
            continueChoice: null,
            submittedAt: new Date('2026-05-13T10:03:00.000Z'),
          },
        ],
      },
    ]);

    const entries = await listTendingEntries(sessionId, userId);

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'tending-1',
        responseCount: 2,
        myResponse: expect.objectContaining({
          id: 'response-1',
          status: 'WORKED',
        }),
      }),
    ]);
  });

  it('upserts one response per entry/user and keeps one-sided check-ins partial', async () => {
    (prisma.tendingEntry.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 'tending-1',
        sessionId,
        agreementId: 'agreement-1',
        type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
        status: TendingEntryStatus.OPEN,
        scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
        openedAt: new Date('2026-05-13T10:00:00.000Z'),
        completedAt: null,
        summary: 'Check in',
        createdAt: new Date('2026-05-06T10:00:00.000Z'),
        updatedAt: new Date('2026-05-13T10:00:00.000Z'),
        responses: [],
        session: { relationship: { members: [{ userId }, { userId: partnerId }] } },
      })
      .mockResolvedValueOnce({
        id: 'tending-1',
        sessionId,
        agreementId: 'agreement-1',
        type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
        status: TendingEntryStatus.PARTIAL,
        scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
        openedAt: new Date('2026-05-13T10:00:00.000Z'),
        completedAt: null,
        summary: 'Check in',
        createdAt: new Date('2026-05-06T10:00:00.000Z'),
        updatedAt: new Date('2026-05-13T10:01:00.000Z'),
        responses: [
          {
            id: 'response-1',
            tendingEntryId: 'tending-1',
            userId,
            status: 'WORKED',
            reflection: 'Better',
            continueChoice: ContinueChoice.EXTEND,
            submittedAt: new Date('2026-05-13T10:02:00.000Z'),
          },
        ],
        session: { relationship: { members: [{ userId }, { userId: partnerId }] } },
      });
    (prisma.tendingResponse.count as jest.Mock).mockResolvedValue(1);

    const entry = await submitTendingResponse({
      entryId: 'tending-1',
      userId,
      status: 'WORKED',
      reflection: 'Better',
      continueChoice: ContinueChoice.EXTEND,
    });

    expect(prisma.tendingResponse.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tendingEntryId_userId: { tendingEntryId: 'tending-1', userId } },
      })
    );
    expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TendingEntryStatus.PARTIAL }),
      })
    );
    expect(entry.status).toBe(TendingEntryStatus.PARTIAL);
    expect(publishSessionEvent).toHaveBeenCalledWith(
      sessionId,
      'notification.pending_action',
      expect.objectContaining({ kind: 'tending_response_submitted' }),
      userId
    );
  });

  it('creates passive re-entry for resolved sessions with closure context', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      status: 'RESOLVED',
      relationship: { members: [{ userId }, { userId: partnerId }] },
    });
    (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue({
      kind: 'NO_SHARED_AGREEMENT',
      summary: 'Closed with the gap named.',
      individualProposalIds: ['proposal-1'],
    });
    (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({
      agreements: [],
    });
    (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([
      { needLabel: 'predictability' },
    ]);
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      { description: 'I will keep weekends unscheduled' },
    ]);
    (prisma.tendingEntry.create as jest.Mock).mockResolvedValue({
      id: 'reentry-1',
      sessionId,
      agreementId: null,
      type: TendingEntryType.USER_INITIATED_REENTRY,
      status: TendingEntryStatus.OPEN,
      scheduledFor: null,
      openedAt: new Date('2026-05-14T10:00:00.000Z'),
      completedAt: null,
      summary: 'Passive Tending re-entry context.',
      createdAt: new Date('2026-05-14T10:00:00.000Z'),
      updatedAt: new Date('2026-05-14T10:00:00.000Z'),
      responses: [],
    });

    const entry = await createPassiveReentry({
      sessionId,
      userId,
      intent: 'I want to revisit the open need.',
    });

    expect(prisma.tendingEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TendingEntryType.USER_INITIATED_REENTRY,
          status: TendingEntryStatus.OPEN,
          summary: expect.stringContaining('User intent: I want to revisit the open need.'),
        }),
      })
    );
    expect(entry.id).toBe('reentry-1');
  });

  it('passive re-entry does not notify partner', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      status: 'RESOLVED',
      relationship: { members: [{ userId }, { userId: partnerId }] },
    });
    (prisma.stage4Closure.findUnique as jest.Mock).mockResolvedValue({
      kind: 'NO_SHARED_AGREEMENT',
      summary: 'Closed with the gap named.',
      individualProposalIds: [],
    });
    (prisma.sharedVessel.findUnique as jest.Mock).mockResolvedValue({
      agreements: [],
    });
    (prisma.stage4NeedCoverage.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.tendingEntry.create as jest.Mock).mockResolvedValue({
      id: 'reentry-1',
      sessionId,
      agreementId: null,
      type: TendingEntryType.USER_INITIATED_REENTRY,
      status: TendingEntryStatus.OPEN,
      scheduledFor: null,
      openedAt: new Date('2026-05-14T10:00:00.000Z'),
      completedAt: null,
      summary: 'Passive Tending re-entry context.',
      createdAt: new Date('2026-05-14T10:00:00.000Z'),
      updatedAt: new Date('2026-05-14T10:00:00.000Z'),
      responses: [],
    });

    await createPassiveReentry({
      sessionId,
      userId,
      intent: 'I need to think this through privately.',
    });

    expect(prisma.tendingEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId,
          type: TendingEntryType.USER_INITIATED_REENTRY,
          status: TendingEntryStatus.OPEN,
        }),
      })
    );
    expect(publishSessionEvent).not.toHaveBeenCalled();
  });

  it('publishes partner notification only through the partner-involving re-entry path', async () => {
    await publishPartnerInvolvingReentryChoice({
      sessionId,
      userId,
      tendingEntryId: 'reentry-1',
    });

    expect(publishSessionEvent).toHaveBeenCalledWith(
      sessionId,
      'notification.pending_action',
      expect.objectContaining({
        kind: 'tending_reentry_partner_action_requested',
        tendingEntryId: 'reentry-1',
        createdBy: userId,
      }),
      userId
    );
  });

  it('opens due scheduled entries and publishes a pending action', async () => {
    (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([
      { id: 'tending-1', sessionId },
    ]);
    (prisma.tendingEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await openDueTendingEntries(new Date('2026-05-13T10:00:00.000Z'));

    expect(result).toEqual({ opened: 1, entryIds: ['tending-1'] });
    expect(prisma.tendingEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'tending-1', status: TendingEntryStatus.SCHEDULED },
      data: {
        status: TendingEntryStatus.OPEN,
        openedAt: new Date('2026-05-13T10:00:00.000Z'),
      },
    });
    expect(publishSessionEvent).toHaveBeenCalledWith(
      sessionId,
      'notification.pending_action',
      expect.objectContaining({ kind: 'tending_checkin_opened' })
    );
  });

  it('schedules individual commitment check-ins with INDIVIDUAL scope and owner', async () => {
    (prisma.tendingEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'tending-ind-1' });

    const ids = await scheduleIndividualCommitmentTendingEntries(
      prisma as any,
      sessionId,
      [
        { proposalId: 'prop-1', ownerUserId: userId, description: 'Daily quiet 5 minutes' },
      ],
      new Date('2026-05-13T10:00:00.000Z'),
      new Date('2026-05-06T10:00:00.000Z')
    );

    expect(ids).toEqual(['tending-ind-1']);
    expect(prisma.tendingEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId,
        type: TendingEntryType.SCHEDULED_INDIVIDUAL_COMMITMENT_CHECKIN,
        scope: TendingEntryScope.INDIVIDUAL,
        ownerUserId: userId,
        optedInShared: false,
        status: TendingEntryStatus.SCHEDULED,
        scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
      }),
    });
  });

  it('hides another user\'s unshared INDIVIDUAL entry from the partner', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      relationship: { members: [{ userId }, { userId: partnerId }] },
    });
    (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([]);

    await listTendingEntries(sessionId, partnerId);

    expect(prisma.tendingEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId,
          OR: [
            { scope: TendingEntryScope.SHARED },
            { scope: TendingEntryScope.INDIVIDUAL, ownerUserId: partnerId },
            { scope: TendingEntryScope.INDIVIDUAL, optedInShared: true },
          ],
        }),
      })
    );
  });

  it('lists only coordination cycles that include the current user', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: sessionId,
      relationship: { members: [{ userId }, { userId: partnerId }] },
    });
    (prisma.tendingCoordinationCycle.findMany as jest.Mock).mockResolvedValue([{
      id: 'coordination-1',
      sessionId,
      status: TendingCoordinationStatus.WAITING_FOR_PARTNER,
      entryIds: ['tending-1'],
      participantUserIds: [userId, partnerId],
      submittedUserIds: [userId],
      responseDeadlineAt: new Date('2026-05-27T00:00:00.000Z'),
      resolvedAt: null,
      resultSummary: 'Held privately.',
      createdAt: new Date('2026-05-13T00:00:00.000Z'),
      updatedAt: new Date('2026-05-13T00:00:00.000Z'),
    }]);

    const cycles = await listTendingCoordinationCycles(sessionId, userId);

    expect(prisma.tendingCoordinationCycle.findMany).toHaveBeenCalledWith({
      where: {
        sessionId,
        participantUserIds: { has: userId },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 10,
    });
    expect(cycles[0]).toEqual(
      expect.objectContaining({
        id: 'coordination-1',
        status: TendingCoordinationStatus.WAITING_FOR_PARTNER,
        submittedUserIds: [userId],
      })
    );
  });

  it('owner can flip optedInShared via setIndividualEntryShare; non-owner is forbidden', async () => {
    const entryRow = {
      id: 'tending-ind-1',
      sessionId,
      agreementId: null,
      type: TendingEntryType.SCHEDULED_INDIVIDUAL_COMMITMENT_CHECKIN,
      scope: TendingEntryScope.INDIVIDUAL,
      ownerUserId: userId,
      optedInShared: false,
      status: TendingEntryStatus.SCHEDULED,
      scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
      openedAt: null,
      completedAt: null,
      summary: 'Mine',
      createdAt: new Date('2026-05-06T10:00:00.000Z'),
      updatedAt: new Date('2026-05-06T10:00:00.000Z'),
      responses: [],
      session: { relationship: { members: [{ userId }, { userId: partnerId }] } },
    };
    (prisma.tendingEntry.findFirst as jest.Mock)
      .mockResolvedValueOnce(entryRow)
      .mockResolvedValueOnce({ ...entryRow, optedInShared: true });

    const dto = await setIndividualEntryShare({
      entryId: 'tending-ind-1',
      userId,
      optedInShared: true,
    });

    expect(prisma.tendingEntry.update).toHaveBeenCalledWith({
      where: { id: 'tending-ind-1' },
      data: { optedInShared: true },
    });
    expect(dto.optedInShared).toBe(true);

    (prisma.tendingEntry.findFirst as jest.Mock).mockResolvedValueOnce(entryRow);
    await expect(
      setIndividualEntryShare({
        entryId: 'tending-ind-1',
        userId: partnerId,
        optedInShared: true,
      })
    ).rejects.toBeInstanceOf(TendingForbiddenError);
  });

  describe('submitTendingCheckin (Stage 4 Phase 5)', () => {
    const baseOrientations = (
      choice: ContinueChoice,
      partialClosure?: Record<string, PartialClosureResolution>
    ) => ({
      whatWorked: { reflection: 'small wins' },
      whereMoreSupport: { reflection: 'still hard' },
      whatComesNext: { continueChoice: choice, partialClosure },
    });

    const openSharedEntry = (id: string) => ({
      id,
      sessionId,
      agreementId: `agreement-${id}`,
      type: TendingEntryType.SCHEDULED_SHARED_AGREEMENT_CHECKIN,
      scope: TendingEntryScope.SHARED,
      ownerUserId: null,
      optedInShared: false,
      status: TendingEntryStatus.OPEN,
      scheduledFor: new Date('2026-05-13T10:00:00.000Z'),
      openedAt: new Date('2026-05-13T10:00:00.000Z'),
      completedAt: null,
      summary: 'Check in',
      createdAt: new Date('2026-05-06T10:00:00.000Z'),
      updatedAt: new Date('2026-05-13T10:00:00.000Z'),
      responses: [],
    });

    const openIndividualEntry = (id: string) => ({
      ...openSharedEntry(id),
      agreementId: null,
      type: TendingEntryType.SCHEDULED_INDIVIDUAL_COMMITMENT_CHECKIN,
      scope: TendingEntryScope.INDIVIDUAL,
      ownerUserId: userId,
      summary: 'Private individual commitment',
    });

    const stubSession = () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: sessionId,
        status: 'ACTIVE',
        relationshipId: 'rel-1',
        type: 'CONFLICT_RESOLUTION',
        relationship: { members: [{ userId }, { userId: partnerId }] },
      });
    };

    beforeEach(() => {
      (prisma.tendingCheckin.create as jest.Mock).mockResolvedValue({
        id: 'checkin-1',
        sessionId,
        userId,
        nextAction: TendingNextAction.EXTEND,
        continueChoice: ContinueChoice.EXTEND,
        reflectionSummary: 'What worked: small wins\nWhere more support: still hard',
        submittedAt: new Date('2026-05-20T10:00:00.000Z'),
        createdAt: new Date('2026-05-20T10:00:00.000Z'),
      });
      (prisma.tendingResponse.upsert as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({
          id: `resp-${args.where.tendingEntryId_userId.tendingEntryId}`,
          ...args.create,
          submittedAt: args.create.submittedAt ?? new Date('2026-05-20T10:00:00.000Z'),
        })
      );
      (prisma.tendingEntryOutcome.upsert as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({
          id: `outcome-${args.create.tendingEntryId}`,
          ...args.create,
          createdAt: new Date('2026-05-20T10:01:00.000Z'),
        })
      );
      (prisma.tendingNeedOutcome.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({
          id: `need-outcome-${args.data.needId ?? 'unknown'}`,
          ...args.data,
          needId: args.data.needId ?? null,
          sourceUserId: args.data.sourceUserId ?? null,
          note: args.data.note ?? null,
          changedNeedLabel: args.data.changedNeedLabel ?? null,
          nextAction: args.data.nextAction ?? null,
          createdAt: new Date('2026-05-20T10:02:00.000Z'),
        })
      );
      (prisma.tendingReminder.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({
          id: `reminder-${args.data.scope}`,
          ...args.data,
          checkinId: args.data.checkinId ?? null,
          tendingEntryId: args.data.tendingEntryId ?? null,
          cadence: args.data.cadence ?? null,
          note: args.data.note ?? null,
          status: 'SCHEDULED',
          createdAt: new Date('2026-05-20T10:03:00.000Z'),
          updatedAt: new Date('2026-05-20T10:03:00.000Z'),
        })
      );
      (prisma.tendingCoordinationCycle.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.tendingCoordinationCycle.create as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({
          id: 'coordination-1',
          ...args.data,
          resolvedAt: null,
          createdAt: new Date('2026-05-20T10:00:00.000Z'),
          updatedAt: new Date('2026-05-20T10:00:00.000Z'),
        })
      );
      (prisma.tendingCoordinationCycle.update as jest.Mock).mockImplementation((args: any) =>
        Promise.resolve({
          id: args.where.id,
          sessionId,
          createdByUserId: userId,
          entryIds: ['t1'],
          participantUserIds: [userId, partnerId],
          submittedUserIds: args.data.submittedUserIds ?? [userId],
          responseDeadlineAt: new Date('2026-06-03T10:00:00.000Z'),
          resolvedAt: args.data.resolvedAt ?? null,
          resultSummary: args.data.resultSummary ?? null,
          status: args.data.status,
          createdAt: new Date('2026-05-20T10:00:00.000Z'),
          updatedAt: new Date('2026-05-20T10:00:00.000Z'),
        })
      );
    });

    it('rejects when there are no open entries', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([]);
      await expect(
        submitTendingCheckin({
          sessionId,
          userId,
          orientations: baseOrientations(ContinueChoice.EXTEND),
        })
      ).rejects.toBeInstanceOf(TendingInvalidStateError);
    });

    it('persists structured entry outcomes and per-entry notes on the batch response', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openSharedEntry('t1')]);

      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: {
          whatWorked: {
            reflection: 'We tested it.',
            perEntryNotes: { t1: 'The Sunday talk happened once.' },
          },
          whereMoreSupport: {
            reflection: 'It needs a clearer reminder.',
            perEntryNotes: { t1: 'We forgot the second week.' },
          },
          whatComesNext: { continueChoice: ContinueChoice.EXTEND },
        },
        entryOutcomes: [{
          tendingEntryId: 't1',
          followThroughStatus: TendingFollowThroughStatus.PARTLY_HAPPENED,
          helpfulnessStatus: TendingHelpfulnessStatus.PARTLY_HELPED,
          blockerCategories: [TendingBlockerCategory.FORGOT],
          whatHappened: 'We did one check-in and missed one.',
          helpedNeed: 'It helped predictability a little.',
          blockerNote: 'No calendar reminder.',
          stillWorthTrying: true,
        }],
        now: new Date('2026-05-20T10:00:00.000Z'),
      });

      expect(prisma.tendingCheckin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId,
          userId,
          nextAction: TendingNextAction.ADJUST_COMMITMENT,
          continueChoice: ContinueChoice.EXTEND,
        }),
      });
      expect(prisma.tendingResponse.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            checkinId: 'checkin-1',
            reflection: expect.stringContaining('Entry note - what worked: The Sunday talk happened once.'),
          }),
          update: expect.objectContaining({
            reflection: expect.stringContaining('What actually happened: We did one check-in and missed one.'),
          }),
        })
      );
      expect(prisma.tendingEntryOutcome.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            checkinId: 'checkin-1',
            tendingEntryId: 't1',
            responseId: 'resp-t1',
            followThroughStatus: TendingFollowThroughStatus.PARTLY_HAPPENED,
            helpfulnessStatus: TendingHelpfulnessStatus.PARTLY_HELPED,
            blockerCategories: [TendingBlockerCategory.FORGOT],
          }),
        })
      );
    });

    it('persists structured need outcomes on the batch check-in', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openSharedEntry('t1')]);

      const result = await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.ANOTHER_ROUND),
        needOutcomes: [{
          needId: 'need-clean-space',
          needLabel: 'healthy, clean space',
          sourceUserId: userId,
          resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
          note: 'The agreement did not stop the boundary violation.',
          nextAction: TendingNextAction.REOPEN_STRATEGY_WORK,
        }],
      });

      expect(prisma.tendingNeedOutcome.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          checkinId: 'checkin-1',
          sessionId,
          needId: 'need-clean-space',
          needLabel: 'healthy, clean space',
          resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
        }),
      });
      expect(result.checkin?.needOutcomes?.[0]).toEqual(
        expect.objectContaining({
          needId: 'need-clean-space',
          resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
        })
      );
    });

    it('creates shared reminders only for shared entries', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openSharedEntry('t1')]);

      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.EXTEND),
        reminders: [{
          tendingEntryId: 't1',
          scope: TendingReminderScope.SHARED,
          remindAt: '2026-05-27T10:00:00.000Z',
          cadence: 'ONCE',
          note: 'Midpoint shared check-in',
        }],
      });

      expect(prisma.tendingReminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId,
          checkinId: 'checkin-1',
          tendingEntryId: 't1',
          userId,
          scope: TendingReminderScope.SHARED,
          remindAt: new Date('2026-05-27T10:00:00.000Z'),
        }),
      });

      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('private-1')]);
      await expect(
        submitTendingCheckin({
          sessionId,
          userId,
          orientations: baseOrientations(ContinueChoice.EXTEND),
          reminders: [{
            tendingEntryId: 'private-1',
            scope: TendingReminderScope.SHARED,
            remindAt: '2026-05-27T10:00:00.000Z',
          }],
        })
      ).rejects.toBeInstanceOf(TendingInvalidStateError);
    });

    it('private individual reminders do not notify the partner', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('private-1')]);

      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.EXTEND),
        reminders: [{
          tendingEntryId: 'private-1',
          scope: TendingReminderScope.PRIVATE,
          remindAt: '2026-05-27T10:00:00.000Z',
          note: 'Remind me only',
        }],
      });

      expect(prisma.tendingReminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scope: TendingReminderScope.PRIVATE,
          tendingEntryId: 'private-1',
        }),
      });
      expect(publishSessionEvent).not.toHaveBeenCalledWith(
        sessionId,
        'notification.pending_action',
        expect.objectContaining({ kind: 'tending_checkin_submitted' }),
        userId
      );
    });

    it('holds shared check-in choices after one partner submits', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openSharedEntry('t1')]);

      const result = await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.EXTEND),
        now: new Date('2026-05-20T10:00:00.000Z'),
      });

      expect(result.coordinationCycle).toEqual(
        expect.objectContaining({
          id: 'coordination-1',
          status: TendingCoordinationStatus.WAITING_FOR_PARTNER,
          submittedUserIds: [userId],
        })
      );
      expect(prisma.tendingCheckin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ coordinationCycleId: 'coordination-1' }),
      });
      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: { status: TendingEntryStatus.PARTIAL },
        })
      );
      expect(prisma.tendingEntry.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: TendingEntryStatus.SCHEDULED }),
        })
      );
    });

    it('marks shared coordination ready after both partners submit', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openSharedEntry('t1')]);
      (prisma.tendingCoordinationCycle.findFirst as jest.Mock).mockResolvedValue({
        id: 'coordination-1',
        sessionId,
        createdByUserId: partnerId,
        status: TendingCoordinationStatus.WAITING_FOR_PARTNER,
        entryIds: ['t1'],
        participantUserIds: [userId, partnerId],
        submittedUserIds: [partnerId],
        responseDeadlineAt: new Date('2026-06-03T10:00:00.000Z'),
        resolvedAt: null,
        resultSummary: null,
        createdAt: new Date('2026-05-20T10:00:00.000Z'),
        updatedAt: new Date('2026-05-20T10:00:00.000Z'),
      });

      const result = await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.EXTEND),
      });

      expect(prisma.tendingCoordinationCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'coordination-1' },
          data: expect.objectContaining({
            submittedUserIds: [partnerId, userId].sort(),
            status: TendingCoordinationStatus.READY_TO_RESOLVE,
          }),
        })
      );
      expect(result.coordinationCycle?.status).toBe(TendingCoordinationStatus.READY_TO_RESOLVE);
    });

    it('records timed-out shared coordination when the partner misses the response window', async () => {
      (prisma.tendingCoordinationCycle.findMany as jest.Mock).mockResolvedValue([{
        id: 'coordination-1',
        sessionId,
        status: TendingCoordinationStatus.WAITING_FOR_PARTNER,
        entryIds: ['t1'],
        participantUserIds: [userId, partnerId],
        submittedUserIds: [userId],
        responseDeadlineAt: new Date('2026-06-03T10:00:00.000Z'),
      }]);
      (prisma.tendingCoordinationCycle.update as jest.Mock).mockResolvedValue({
        id: 'coordination-1',
        status: TendingCoordinationStatus.TIMED_OUT,
      });

      const result = await resolveTimedOutTendingCoordinationCycles(
        new Date('2026-06-04T10:00:00.000Z')
      );

      expect(result).toEqual({ resolved: 1, cycleIds: ['coordination-1'] });
      expect(prisma.tendingCoordinationCycle.update).toHaveBeenCalledWith({
        where: { id: 'coordination-1' },
        data: expect.objectContaining({
          status: TendingCoordinationStatus.TIMED_OUT,
          resultSummary: expect.stringContaining(partnerId),
        }),
      });
      expect(publishSessionEvent).toHaveBeenCalledWith(
        sessionId,
        'notification.pending_action',
        expect.objectContaining({
          kind: 'tending_coordination_timed_out',
          missingUserIds: [partnerId],
        })
      );
    });

    it('resolves overlapping shared extension after both partners submit', async () => {
      (prisma.tendingCoordinationCycle.findMany as jest.Mock).mockResolvedValue([{
        id: 'coordination-1',
        sessionId,
        status: TendingCoordinationStatus.READY_TO_RESOLVE,
        entryIds: ['t1', 't2'],
        participantUserIds: [userId, partnerId],
        submittedUserIds: [userId, partnerId],
        responseDeadlineAt: new Date('2026-06-03T10:00:00.000Z'),
        checkins: [
          { continueChoice: ContinueChoice.EXTEND, entryOutcomes: [], needOutcomes: [] },
          { continueChoice: ContinueChoice.EXTEND, entryOutcomes: [], needOutcomes: [] },
        ],
      }]);

      const result = await resolveReadyTendingCoordinationCycles(
        new Date('2026-05-21T10:00:00.000Z')
      );

      expect(result).toEqual({ resolved: 1, cycleIds: ['coordination-1'] });
      expect(prisma.tendingEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1', 't2'] } },
        data: expect.objectContaining({
          status: TendingEntryStatus.SCHEDULED,
          openedAt: null,
          completedAt: null,
        }),
      });
      expect(prisma.tendingCoordinationCycle.update).toHaveBeenCalledWith({
        where: { id: 'coordination-1' },
        data: expect.objectContaining({
          status: TendingCoordinationStatus.RESOLVED,
          resultSummary: expect.stringContaining('Both participants chose extension'),
        }),
      });
      expect(publishSessionEvent).toHaveBeenCalledWith(
        sessionId,
        'notification.pending_action',
        expect.objectContaining({ kind: 'tending_coordination_resolved' })
      );
    });

    it('does not blindly extend when shared follow-through failed and a need remains open', async () => {
      (prisma.tendingCoordinationCycle.findMany as jest.Mock).mockResolvedValue([{
        id: 'coordination-1',
        sessionId,
        status: TendingCoordinationStatus.READY_TO_RESOLVE,
        entryIds: ['t1'],
        participantUserIds: [userId, partnerId],
        submittedUserIds: [userId, partnerId],
        responseDeadlineAt: new Date('2026-06-03T10:00:00.000Z'),
        checkins: [
          {
            continueChoice: ContinueChoice.EXTEND,
            entryOutcomes: [{
              followThroughStatus: TendingFollowThroughStatus.DID_NOT_HAPPEN,
              helpfulnessStatus: TendingHelpfulnessStatus.DID_NOT_HELP,
              stillWorthTrying: false,
            }],
            needOutcomes: [{
              resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
            }],
          },
          { continueChoice: ContinueChoice.EXTEND, entryOutcomes: [], needOutcomes: [] },
        ],
      }]);

      await resolveReadyTendingCoordinationCycles(new Date('2026-05-21T10:00:00.000Z'));

      expect(prisma.tendingEntry.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: TendingEntryStatus.SCHEDULED }),
        })
      );
      expect(prisma.tendingCoordinationCycle.update).toHaveBeenCalledWith({
        where: { id: 'coordination-1' },
        data: expect.objectContaining({
          status: TendingCoordinationStatus.RESOLVED,
          resultSummary: expect.stringContaining('failed follow-through'),
        }),
      });
    });

    it('closes only mutually resolved entries for shared partial closure overlap', async () => {
      (prisma.tendingCoordinationCycle.findMany as jest.Mock).mockResolvedValue([{
        id: 'coordination-1',
        sessionId,
        status: TendingCoordinationStatus.READY_TO_RESOLVE,
        entryIds: ['t1', 't2'],
        participantUserIds: [userId, partnerId],
        submittedUserIds: [userId, partnerId],
        responseDeadlineAt: new Date('2026-06-03T10:00:00.000Z'),
        checkins: [
          {
            continueChoice: ContinueChoice.PARTIAL_CLOSURE,
            responses: [{
              partialClosures: [
                { tendingEntryId: 't1', resolution: PartialClosureResolution.RESOLVED },
                { tendingEntryId: 't2', resolution: PartialClosureResolution.CONTINUING },
              ],
            }],
            entryOutcomes: [],
            needOutcomes: [],
          },
          {
            continueChoice: ContinueChoice.PARTIAL_CLOSURE,
            responses: [{
              partialClosures: [
                { tendingEntryId: 't1', resolution: PartialClosureResolution.RESOLVED },
                { tendingEntryId: 't2', resolution: PartialClosureResolution.CONTINUING },
              ],
            }],
            entryOutcomes: [],
            needOutcomes: [],
          },
        ],
      }]);

      await resolveReadyTendingCoordinationCycles(new Date('2026-05-21T10:00:00.000Z'));

      expect(prisma.tendingEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] } },
        data: { status: TendingEntryStatus.COMPLETED, completedAt: new Date('2026-05-21T10:00:00.000Z') },
      });
      expect(prisma.tendingEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t2'] } },
        data: expect.objectContaining({
          status: TendingEntryStatus.SCHEDULED,
          openedAt: null,
          completedAt: null,
        }),
      });
      expect(prisma.tendingCoordinationCycle.update).toHaveBeenCalledWith({
        where: { id: 'coordination-1' },
        data: expect.objectContaining({
          resultSummary: expect.stringContaining('Both participants chose partial closure'),
        }),
      });
    });

    it('continues unresolved shared entries for mixed extension and partial closure', async () => {
      (prisma.tendingCoordinationCycle.findMany as jest.Mock).mockResolvedValue([{
        id: 'coordination-1',
        sessionId,
        status: TendingCoordinationStatus.READY_TO_RESOLVE,
        entryIds: ['t1'],
        participantUserIds: [userId, partnerId],
        submittedUserIds: [userId, partnerId],
        responseDeadlineAt: new Date('2026-06-03T10:00:00.000Z'),
        checkins: [
          { continueChoice: ContinueChoice.EXTEND, responses: [], entryOutcomes: [], needOutcomes: [] },
          {
            continueChoice: ContinueChoice.PARTIAL_CLOSURE,
            responses: [{
              partialClosures: [
                { tendingEntryId: 't1', resolution: PartialClosureResolution.RESOLVED },
              ],
            }],
            entryOutcomes: [],
            needOutcomes: [],
          },
        ],
      }]);

      await resolveReadyTendingCoordinationCycles(new Date('2026-05-21T10:00:00.000Z'));

      expect(prisma.tendingEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] } },
        data: expect.objectContaining({
          status: TendingEntryStatus.SCHEDULED,
          openedAt: null,
          completedAt: null,
        }),
      });
      expect(prisma.tendingCoordinationCycle.update).toHaveBeenCalledWith({
        where: { id: 'coordination-1' },
        data: expect.objectContaining({
          resultSummary: expect.stringContaining('One participant chose extension and one chose partial closure'),
        }),
      });
    });

    it('EXTEND reschedules every open entry and keeps the session active', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('t1')]);
      const result = await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.EXTEND),
      });
      expect(result.continueChoice).toBe(ContinueChoice.EXTEND);
      expect(result.nextScheduledFor).toBeInstanceOf(Date);
      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: TendingEntryStatus.SCHEDULED }),
        })
      );
      // Session should not be transitioned out of ACTIVE.
      expect(prisma.session.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED' }) })
      );
    });

    it('EXTEND completes entries that are no longer worth trying instead of rescheduling them', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([
        openIndividualEntry('t1'),
        openIndividualEntry('t2'),
      ]);

      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.EXTEND),
        entryOutcomes: [
          {
            tendingEntryId: 't1',
            followThroughStatus: TendingFollowThroughStatus.DID_NOT_HAPPEN,
            helpfulnessStatus: TendingHelpfulnessStatus.DID_NOT_HELP,
            blockerCategories: [TendingBlockerCategory.TOO_HARD],
            stillWorthTrying: false,
          },
          {
            tendingEntryId: 't2',
            followThroughStatus: TendingFollowThroughStatus.HAPPENED,
            helpfulnessStatus: TendingHelpfulnessStatus.HELPED,
            stillWorthTrying: true,
          },
        ],
      });

      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: TendingEntryStatus.COMPLETED }),
        })
      );
      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't2' },
          data: expect.objectContaining({ status: TendingEntryStatus.SCHEDULED }),
        })
      );
    });

    it('EXTEND completes entries instead of rescheduling when submitted needs are resolved', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('t1')]);

      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.EXTEND),
        needOutcomes: [{
          needId: 'need-1',
          needLabel: 'predictability',
          resolutionStatus: TendingNeedResolutionStatus.RESOLVED,
        }],
      });

      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: TendingEntryStatus.COMPLETED }),
        })
      );
    });

    it('FULL_CLOSURE marks every open entry COMPLETED and resolves the session', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('t1')]);
      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.FULL_CLOSURE),
        needOutcomes: [{
          needId: 'need-1',
          needLabel: 'predictability',
          resolutionStatus: TendingNeedResolutionStatus.RESOLVED,
        }],
      });
      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: TendingEntryStatus.COMPLETED }),
        })
      );
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionId },
          data: expect.objectContaining({ status: 'RESOLVED' }),
        })
      );
    });

    it('FULL_CLOSURE rejects still-open needs without an explicit resolved-enough override', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openSharedEntry('t1')]);

      await expect(
        submitTendingCheckin({
          sessionId,
          userId,
          orientations: baseOrientations(ContinueChoice.FULL_CLOSURE),
          needOutcomes: [{
            needId: 'need-1',
            needLabel: 'predictability',
            resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
          }],
        })
      ).rejects.toBeInstanceOf(TendingInvalidStateError);

      expect(prisma.tendingCheckin.create).not.toHaveBeenCalled();
    });

    it('FULL_CLOSURE records override context instead of blocking indefinitely', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('t1')]);

      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.FULL_CLOSURE),
        needOutcomes: [{
          needId: 'need-1',
          needLabel: 'predictability',
          resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
        }],
        resolvedEnoughOverride: true,
        resolvedEnoughOverrideNote: 'I know this is not perfect, but I want to close here.',
      });

      expect(prisma.tendingCheckin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reflectionSummary: expect.stringContaining('Resolved-enough override'),
        }),
      });
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'RESOLVED' }),
        })
      );
    });

    it('ANOTHER_ROUND reopens Stage 4 around still-open needs without deleting coverage history', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('t1')]);
      (prisma.stageProgress.findMany as jest.Mock).mockResolvedValue([
        { id: 'sp-1', gatesSatisfied: { selectionSubmitted: true } },
      ]);
      await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.ANOTHER_ROUND),
        needOutcomes: [{
          needId: 'need-clean-space',
          needLabel: 'healthy, clean space',
          resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
        }],
      });
      expect(prisma.stage4Closure.deleteMany).toHaveBeenCalledWith({ where: { sessionId } });
      expect(prisma.stage4ProposalSelection.deleteMany).toHaveBeenCalledWith({ where: { sessionId } });
      expect(prisma.stage4NeedCoverage.deleteMany).not.toHaveBeenCalled();
      expect(prisma.stage4NeedDeclination.deleteMany).not.toHaveBeenCalled();
      expect(prisma.stageProgress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sp-1' },
          data: expect.objectContaining({
            gatesSatisfied: expect.objectContaining({
              tendingReopen: expect.objectContaining({
                checkinId: 'checkin-1',
                stillOpenNeedIds: ['need-clean-space'],
              }),
            }),
          }),
        })
      );
    });

    it('NEW_PROCESS creates a fresh session linked back to the current one and resolves it', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([openIndividualEntry('t1')]);
      (prisma.session.create as jest.Mock).mockResolvedValue({ id: 'session-2' });
      const result = await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.NEW_PROCESS),
        entryOutcomes: [{
          tendingEntryId: 't1',
          followThroughStatus: TendingFollowThroughStatus.DID_NOT_HAPPEN,
          helpfulnessStatus: TendingHelpfulnessStatus.DID_NOT_HELP,
          blockerCategories: [TendingBlockerCategory.PARTNER_DID_NOT_DO_PART],
          whatHappened: 'The behavior continued three times.',
        }],
        needOutcomes: [{
          needId: 'need-clean-space',
          needLabel: 'healthy, clean space',
          resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
          note: 'The original issue still needs a different container.',
        }],
      });
      expect(result.newSessionId).toBe('session-2');
      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationshipId: 'rel-1',
            previousSessionId: sessionId,
            status: 'CREATED',
            topicFrame: 'Tending follow-up',
          }),
        })
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-2',
          forUserId: userId,
          role: 'SYSTEM',
          content: expect.stringContaining('Prior Tending handoff'),
          stage: 0,
        }),
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: expect.stringContaining('healthy, clean space'),
        }),
      });
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionId },
          data: expect.objectContaining({ status: 'RESOLVED' }),
        })
      );
    });

    it('recommends adjustment or strategy reopening when needs remain open and follow-through failed', () => {
      expect(recommendTendingNextAction({
        continueChoice: ContinueChoice.EXTEND,
        entryOutcomes: [{
          tendingEntryId: 't1',
          followThroughStatus: TendingFollowThroughStatus.DID_NOT_HAPPEN,
          helpfulnessStatus: TendingHelpfulnessStatus.DID_NOT_HELP,
        }],
        needOutcomes: [{
          needId: 'need-1',
          needLabel: 'clean space',
          resolutionStatus: TendingNeedResolutionStatus.STILL_OPEN,
        }],
      })).toBe(TendingNextAction.REOPEN_STRATEGY_WORK);

      expect(recommendTendingNextAction({
        continueChoice: ContinueChoice.EXTEND,
        entryOutcomes: [{
          tendingEntryId: 't1',
          followThroughStatus: TendingFollowThroughStatus.PARTLY_HAPPENED,
          helpfulnessStatus: TendingHelpfulnessStatus.PARTLY_HELPED,
          blockerCategories: [TendingBlockerCategory.TOO_FREQUENT],
        }],
        needOutcomes: [{
          needId: 'need-1',
          needLabel: 'predictability',
          resolutionStatus: TendingNeedResolutionStatus.IMPROVING,
        }],
      })).toBe(TendingNextAction.ADJUST_COMMITMENT);
    });

    it('PARTIAL_CLOSURE closes RESOLVED entries and reschedules CONTINUING entries', async () => {
      stubSession();
      (prisma.tendingEntry.findMany as jest.Mock).mockResolvedValue([
        openIndividualEntry('t1'),
        openIndividualEntry('t2'),
      ]);
      const result = await submitTendingCheckin({
        sessionId,
        userId,
        orientations: baseOrientations(ContinueChoice.PARTIAL_CLOSURE, {
          t1: PartialClosureResolution.RESOLVED,
          t2: PartialClosureResolution.CONTINUING,
        }),
      });
      expect(result.continueChoice).toBe(ContinueChoice.PARTIAL_CLOSURE);
      expect(prisma.tendingResponsePartialClosure.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            tendingEntryId: 't1',
            resolution: PartialClosureResolution.RESOLVED,
          }),
        })
      );
      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: TendingEntryStatus.COMPLETED }),
        })
      );
      expect(prisma.tendingEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't2' },
          data: expect.objectContaining({ status: TendingEntryStatus.SCHEDULED }),
        })
      );
    });
  });
});
