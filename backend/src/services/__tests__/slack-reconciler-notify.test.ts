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

import {
  notifyGuesserOfShareViaSlack,
  postEmpathyRevealToSlack,
} from '../slack-reconciler-notify';

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

describe('postEmpathyRevealToSlack', () => {
  const EMPATHY_INPUT = {
    sessionId: 'sess-1',
    recipientUserId: 'user-guesser',
    subjectName: 'Alice',
    empathyContent: "I think you've been carrying this alone for a long time and just want to be seen.",
  };

  beforeEach(() => {
    sessionSlackThreadFindUnique.mockReset();
    postMessageMock.mockReset();
    postMessageMock.mockResolvedValue({ ok: true });
  });

  it('no-ops for mobile recipients with no Slack thread', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue(null);
    const result = await postEmpathyRevealToSlack(EMPATHY_INPUT);
    expect(result).toEqual({ status: 'no_slack_thread' });
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('posts a blockquoted empathy reveal with accept/revise/decline cue', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D_RECIP',
      threadTs: '9999.0001',
    });

    const result = await postEmpathyRevealToSlack(EMPATHY_INPUT);

    expect(result).toEqual({ status: 'posted', channelId: 'D_RECIP' });
    const [channel, text, threadTs] = postMessageMock.mock.calls[0];
    expect(channel).toBe('D_RECIP');
    expect(threadTs).toBe('9999.0001');
    expect(text).toContain("Alice shared their understanding");
    expect(text).toContain("> I think you've been carrying this");
    expect(text).toContain('accept');
    expect(text).toContain('revise');
    expect(text).toContain('decline');
  });

  it('quotes multi-line empathy content with `>` on every line', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D',
      threadTs: 'T',
    });
    await postEmpathyRevealToSlack({
      ...EMPATHY_INPUT,
      empathyContent: 'First line.\nSecond line.\nThird line.',
    });
    const [, text] = postMessageMock.mock.calls[0];
    expect(text).toContain('> First line.');
    expect(text).toContain('> Second line.');
    expect(text).toContain('> Third line.');
  });

  it('returns post_failed without throwing on Slack failure', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D',
      threadTs: 'T',
    });
    postMessageMock.mockResolvedValue({ ok: false, error: 'rate_limited' });

    const result = await postEmpathyRevealToSlack(EMPATHY_INPUT);
    expect(result).toEqual({ status: 'post_failed', error: 'rate_limited' });
  });
});

// ---------------------------------------------------------------------------
// D.5 — Race: guesser mid-compose when subject shares
// ---------------------------------------------------------------------------

describe('Gentle Interrupt race — guesser mid-compose when subject shares', () => {
  beforeEach(() => {
    sessionSlackThreadFindUnique.mockReset();
    postMessageMock.mockReset();
    postMessageMock.mockResolvedValue({ ok: true });
  });

  /**
   * Simulates the catastrophic UX we designed the Gentle Interrupt to avoid:
   * Guesser is mid-compose (slow "send" operation in flight). Subject shares
   * context, triggering `notifyGuesserOfShareViaSlack`.
   *
   * Expected behavior:
   *  - The interrupt posts IMMEDIATELY, not waiting for the guesser's draft.
   *  - The interrupt lands in the guesser's DM regardless of concurrent ops.
   *  - Neither operation throws due to the other.
   *
   * If this test ever fails because the interrupt blocks on the draft, the
   * Queue pattern we explicitly rejected (see commit message on D.2) is
   * creeping back in.
   */
  it('interrupt does not wait for a concurrent operation on the same user', async () => {
    sessionSlackThreadFindUnique.mockResolvedValue({
      channelId: 'D_GUESSER',
      threadTs: 'G',
    });

    // Simulate a slow in-flight operation on the guesser's side.
    let draftResolve: () => void = () => {};
    const pendingDraft = new Promise<void>((resolve) => { draftResolve = resolve; });

    const interruptStart = Date.now();
    const interruptPromise = notifyGuesserOfShareViaSlack({
      sessionId: 'sess-1',
      guesserUserId: 'user-guesser',
      subjectName: 'Alice',
      sharedContent: 'Hint about A\'s inner state.',
    });

    // The interrupt must resolve before the draft does.
    const interruptResult = await interruptPromise;
    const interruptElapsed = Date.now() - interruptStart;

    expect(interruptResult.status).toBe('posted');
    // Sub-100ms is fine; the point is it didn't block on `pendingDraft`.
    expect(interruptElapsed).toBeLessThan(100);

    // The draft can now complete — no hang, no throw.
    draftResolve();
    await expect(pendingDraft).resolves.toBeUndefined();
  });

  it('two simultaneous interrupts to different guessers both post', async () => {
    sessionSlackThreadFindUnique.mockImplementation(async ({ where }) => {
      return {
        channelId: `D_${(where as { sessionId_userId: { userId: string } }).sessionId_userId.userId}`,
        threadTs: 'T',
      };
    });

    const [a, b] = await Promise.all([
      notifyGuesserOfShareViaSlack({
        sessionId: 's1',
        guesserUserId: 'u1',
        subjectName: 'Alice',
        sharedContent: 'A',
      }),
      notifyGuesserOfShareViaSlack({
        sessionId: 's2',
        guesserUserId: 'u2',
        subjectName: 'Bob',
        sharedContent: 'B',
      }),
    ]);

    expect(a.status).toBe('posted');
    expect(b.status).toBe('posted');
    expect(postMessageMock).toHaveBeenCalledTimes(2);
  });
});
