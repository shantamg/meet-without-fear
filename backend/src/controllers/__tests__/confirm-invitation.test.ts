/**
 * Tests for confirmInvitationMessage.
 *
 * Phase 2 of REMOVE_INVITATION_DRAFT_PLAN: confirmInvitationMessage no longer
 * accepts or writes a `message` field. It only flips messageConfirmed/At and
 * advances the user from Stage 0 to Stage 1.
 */

import { Request, Response } from 'express';

jest.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    invitation: {
      update: jest.fn(),
    },
    stageProgress: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('../../services/realtime', () => ({
  notifyPartner: jest.fn().mockResolvedValue(undefined),
  publishSessionEvent: jest.fn().mockResolvedValue(undefined),
  publishMessageAIResponse: jest.fn().mockResolvedValue(undefined),
  publishMessageError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/ai', () => ({
  getOrchestratedResponse: jest.fn().mockResolvedValue({
    response: 'transition',
    contextBundle: {},
    memoryIntent: {},
    usedMock: false,
  }),
}));

jest.mock('../../services/conversation-summarizer', () => ({
  updateSessionSummary: jest.fn().mockResolvedValue(undefined),
  getSessionSummary: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/embedding', () => ({
  embedSessionContent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../lib/request-context', () => ({
  updateContext: jest.fn(),
  getRequestId: jest.fn().mockReturnValue('req-1'),
}));

jest.mock('../../services/brain-service', () => ({
  brainService: {
    broadcastMessage: jest.fn(),
  },
}));

import { prisma } from '../../lib/prisma';
import { confirmInvitationMessage } from '../sessions';

function buildResMock(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function buildReq(body: Record<string, unknown> = {}): Request {
  return {
    params: { id: 'session-1' },
    body,
    user: { id: 'user-1', name: 'Alice' },
  } as unknown as Request;
}

describe('confirmInvitationMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: 'session-1',
      status: 'CREATED',
      topicFrame: 'Mealtime poking',
      topicFrameConfirmedAt: new Date('2026-05-01T00:00:00Z'),
      invitations: [
        {
          id: 'inv-1',
          invitedById: 'user-1',
          messageConfirmed: false,
          messageConfirmedAt: null,
          name: 'Bob',
        },
      ],
    });
    (prisma.invitation.update as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'inv-1',
      invitedById: 'user-1',
      ...data,
    }));
    (prisma.session.update as jest.Mock).mockResolvedValue({});
  });

  it('flips messageConfirmed/messageConfirmedAt without writing any message text', async () => {
    const res = buildResMock();
    // Even if a "message" body is sent, it must NOT be written to the DB.
    await confirmInvitationMessage(buildReq({ message: 'should be ignored' }), res);

    expect(prisma.invitation.update).toHaveBeenCalledTimes(1);
    const updateArgs = (prisma.invitation.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'inv-1' });
    // Only these two fields should be touched.
    expect(Object.keys(updateArgs.data).sort()).toEqual(
      ['messageConfirmed', 'messageConfirmedAt'].sort(),
    );
    expect(updateArgs.data.messageConfirmed).toBe(true);
    expect(updateArgs.data.messageConfirmedAt).toBeInstanceOf(Date);
    // Must not contain any reference to invitationMessage.
    expect(updateArgs.data).not.toHaveProperty('invitationMessage');
  });

  it('advances the user from Stage 0 to Stage 1', async () => {
    const res = buildResMock();
    await confirmInvitationMessage(buildReq(), res);

    expect(prisma.stageProgress.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stage: 0, status: 'IN_PROGRESS' }),
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(prisma.stageProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId_userId_stage: { sessionId: 'session-1', userId: 'user-1', stage: 1 } },
      }),
    );

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.advancedToStage).toBe(1);
    expect(payload.data.invitation).not.toHaveProperty('invitationMessage');
  });

  it('returns 400 if the topic frame is not yet confirmed', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: 'session-1',
      status: 'CREATED',
      topicFrame: null,
      topicFrameConfirmedAt: null,
      invitations: [
        {
          id: 'inv-1',
          invitedById: 'user-1',
          messageConfirmed: false,
          messageConfirmedAt: null,
        },
      ],
    });

    const res = buildResMock();
    await confirmInvitationMessage(buildReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.invitation.update).not.toHaveBeenCalled();
  });
});
