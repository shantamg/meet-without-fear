import { Request, Response } from 'express';
import { confirmTopicFrame } from '../topic-frame';

jest.mock('../../lib/prisma', () => ({
  prisma: {
    session: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    invitation: {
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../utils/session', () => ({
  isSessionCreator: jest.fn(),
}));

import { prisma } from '../../lib/prisma';
import { isSessionCreator } from '../../utils/session';

function buildResMock(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    params: { id: 'session-1' },
    body: {},
    user: { id: 'user-1', name: 'Alice' },
    ...overrides,
  } as unknown as Request;
}

describe('confirmTopicFrame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isSessionCreator as jest.Mock).mockResolvedValue(true);
    (prisma.invitation.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('flips topicFrameConfirmedAt and returns the topic frame', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: 'session-1',
      topicFrame: 'Mealtime poking',
      topicFrameConfirmedAt: null,
    });
    (prisma.session.update as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'session-1',
      topicFrame: 'Mealtime poking',
      topicFrameConfirmedAt: data.topicFrameConfirmedAt,
    }));

    const res = buildResMock();
    await confirmTopicFrame(buildReq(), res);

    const updateArgs = (prisma.session.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.where.id).toBe('session-1');
    expect(updateArgs.data.topicFrameConfirmedAt).toBeInstanceOf(Date);

    expect((res.status as jest.Mock)).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.topicFrame).toBe('Mealtime poking');
    expect(payload.data.confirmedAt).toBeDefined();
  });

  it('returns VALIDATION_ERROR when the session has no topic frame yet', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: 'session-1',
      topicFrame: null,
      topicFrameConfirmedAt: null,
    });

    const res = buildResMock();
    await confirmTopicFrame(buildReq(), res);

    expect((res.status as jest.Mock)).toHaveBeenCalledWith(400);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('is idempotent when topic is already confirmed (no second update)', async () => {
    const confirmedAt = new Date('2025-01-01T12:00:00Z');
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: 'session-1',
      topicFrame: 'Mealtime poking',
      topicFrameConfirmedAt: confirmedAt,
    });

    const res = buildResMock();
    await confirmTopicFrame(buildReq(), res);

    expect(prisma.session.update).not.toHaveBeenCalled();
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.topicFrame).toBe('Mealtime poking');
    expect(payload.data.confirmedAt).toBe(confirmedAt.toISOString());
  });

  it('rejects non-creators with 403', async () => {
    (isSessionCreator as jest.Mock).mockResolvedValue(false);

    const res = buildResMock();
    await confirmTopicFrame(buildReq(), res);

    expect((res.status as jest.Mock)).toHaveBeenCalledWith(403);
  });

  it('returns 404 when session not found', async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

    const res = buildResMock();
    await confirmTopicFrame(buildReq(), res);

    expect((res.status as jest.Mock)).toHaveBeenCalledWith(404);
  });
});
