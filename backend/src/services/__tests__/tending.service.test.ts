import { prisma } from '../../lib/prisma';
import { publishSessionEvent } from '../realtime';
import {
  createPassiveReentry,
  listTendingEntries,
  openDueTendingEntries,
  scheduleSharedAgreementTendingEntries,
  submitTendingResponse,
} from '../tending.service';
import {
  TendingEntryStatus,
  TendingEntryType,
} from '@meet-without-fear/shared';

jest.mock('../../lib/prisma');
jest.mock('../realtime');
jest.mock('../conversation-summarizer', () => ({
  getSessionSummary: jest.fn().mockResolvedValue({
    summary: { text: 'They agreed to test a calmer planning rhythm.' },
  }),
}));

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
            continueChoice: 'CONTINUE',
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
            continueChoice: 'CONTINUE',
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
      continueChoice: 'CONTINUE',
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
});
