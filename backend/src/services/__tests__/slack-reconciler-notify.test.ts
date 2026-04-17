/**
 * Slack Reconciler Notify Tests
 *
 * Focus: the Gentle Interrupt behavior — Slack-only notification that fires
 * when a Subject shares context via the reconciler. Prisma + slack-client
 * are mocked so no external deps.
 */

const sessionSlackThreadFindUnique = jest.fn();
const postMessageMock = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    sessionSlackThread: { findUnique: sessionSlackThreadFindUnique },
  },
}));

jest.mock('../slack-client', () => ({
  postMessage: (...args: unknown[]) => postMessageMock(...args),
}));

import { notifyGuesserOfShareViaSlack } from '../slack-reconciler-notify';

const BASE_INPUT = {
  sessionId: 'sess-1',
  guesserUserId: 'user-guesser',
  subjectName: 'Alice',
  sharedContent: 'I think what\'s hard for me is not feeling heard when plans change.',
};

describe('notifyGuesserOfShareViaSlack', () => {
  beforeEach(() => {
    sessionSlackThreadFindUnique.mockReset();
    postMessageMock.mockReset();
    postMessageMock.mockResolvedValue({ ok: true });
  });

  it('no-ops when the guesser has no Slack thread (they are on mobile)', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue(null);
    const result = await notifyGuesserOfShareViaSlack(BASE_INPUT);
    expect(result).toEqual({ status: 'no_slack_thread' });
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('posts a Gentle Interrupt to the guesser\'s DM thread', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D_GUESSER',
      threadTs: '1234.5678',
    });

    const result = await notifyGuesserOfShareViaSlack(BASE_INPUT);

    expect(result).toEqual({ status: 'posted', channelId: 'D_GUESSER' });
    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const [channel, text, threadTs] = postMessageMock.mock.calls[0];
    expect(channel).toBe('D_GUESSER');
    expect(threadTs).toBe('1234.5678');
    expect(text).toContain('Alice just shared');
    expect(text).toContain('> I think what\'s hard for me');
    expect(text).toContain('no need to reply to this');
  });

  it('quotes multi-line shared content with `>` per line', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D',
      threadTs: 'T',
    });
    await notifyGuesserOfShareViaSlack({
      ...BASE_INPUT,
      sharedContent: 'Line one\nLine two\nLine three',
    });
    const [, text] = postMessageMock.mock.calls[0];
    expect(text).toContain('> Line one');
    expect(text).toContain('> Line two');
    expect(text).toContain('> Line three');
  });

  it('returns post_failed when Slack post fails and does not throw', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D',
      threadTs: 'T',
    });
    postMessageMock.mockResolvedValue({ ok: false, error: 'channel_not_found' });

    const result = await notifyGuesserOfShareViaSlack(BASE_INPUT);
    expect(result).toEqual({ status: 'post_failed', error: 'channel_not_found' });
  });

  it('uses the (sessionId, userId) composite key for thread lookup', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue(null);
    await notifyGuesserOfShareViaSlack(BASE_INPUT);
    expect(sessionSlackThreadFindUnique).toHaveBeenCalledWith({
      where: { sessionId_userId: { sessionId: 'sess-1', userId: 'user-guesser' } },
      select: { channelId: true, threadTs: true },
    });
  });

  it('frames the quote with the subject name, not the guesser', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D',
      threadTs: 'T',
    });
    await notifyGuesserOfShareViaSlack({
      ...BASE_INPUT,
      subjectName: 'Bob',
    });
    const [, text] = postMessageMock.mock.calls[0];
    expect(text).toContain('Bob just shared');
    expect(text).not.toContain('Guesser');
  });
});
