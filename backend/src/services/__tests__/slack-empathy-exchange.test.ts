/**
 * Slack Empathy Exchange Tests
 */

const empathyDraftFindUnique = jest.fn();
const empathyDraftUpdate = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    empathyDraft: {
      findUnique: empathyDraftFindUnique,
      update: empathyDraftUpdate,
    },
  },
}));

import {
  detectShareCommand,
  detectSendInvitationCommand,
  markDraftReadyToShare,
} from '../slack-empathy-exchange';

describe('detectShareCommand', () => {
  it.each([
    'share',
    'Share',
    'SHARE',
    'share it',
    'send it',
    'ship it',
    '  share  ',
    'share!',
    'share.',
  ])('accepts %p as a share command', (input) => {
    expect(detectShareCommand(input)).toBe(true);
  });

  it.each([
    'I want to share something',
    'share this with them',
    'sharing my feelings',
    'share this thing',
    'what should I share?',
    'share here and now',
  ])('rejects mid-sentence use %p', (input) => {
    expect(detectShareCommand(input)).toBe(false);
  });

  it('rejects empty input', () => {
    expect(detectShareCommand('')).toBe(false);
  });
});

describe('detectSendInvitationCommand', () => {
  it.each([
    'send it',
    'Send it.',
    'send it!',
    'sent',
    'ship it',
    'go ahead',
    'yes, send it',
    'yes send it',
    'yep, send',
    'Yeah, ship it',
    'ok send',
    'okay, send it',
    'looks good, send',
    'looks good send',
    'that looks good, send',
    'that sounds right, send',
    '  send it  ',
  ])('accepts %p as a send-invitation command', (input) => {
    expect(detectSendInvitationCommand(input)).toBe(true);
  });

  it.each([
    "I'll send it later",
    "don't send it",
    'can you send it?',
    'maybe send it tomorrow',
    'share it',
    'share',
    'yes',
    'no',
    'not yet',
    'hold on',
    '',
    '   ',
  ])('rejects %p', (input) => {
    expect(detectSendInvitationCommand(input)).toBe(false);
  });
});

describe('markDraftReadyToShare', () => {
  beforeEach(() => {
    empathyDraftFindUnique.mockReset();
    empathyDraftUpdate.mockReset();
    empathyDraftUpdate.mockResolvedValue({});
  });

  it('flips readyToShare and returns the draft content', async () => {
    empathyDraftFindUnique.mockResolvedValue({
      id: 'draft-1',
      content: 'I think you felt unheard.',
      readyToShare: false,
    });

    const result = await markDraftReadyToShare('sess-1', 'user-1');

    expect(result).toEqual({
      status: 'marked_ready',
      draftId: 'draft-1',
      draftContent: 'I think you felt unheard.',
    });
    expect(empathyDraftUpdate).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { readyToShare: true },
    });
  });

  it('returns no_draft when the user has no draft yet', async () => {
    empathyDraftFindUnique.mockResolvedValue(null);

    const result = await markDraftReadyToShare('sess-1', 'user-1');

    expect(result).toEqual({ status: 'no_draft' });
    expect(empathyDraftUpdate).not.toHaveBeenCalled();
  });

  it('returns empty_draft for zero-content drafts', async () => {
    empathyDraftFindUnique.mockResolvedValue({
      id: 'd',
      content: '   ',
      readyToShare: false,
    });

    const result = await markDraftReadyToShare('sess-1', 'user-1');

    expect(result.status).toBe('empty_draft');
    expect(empathyDraftUpdate).not.toHaveBeenCalled();
  });

  it('returns already_ready and does not re-write when the flag is already set', async () => {
    empathyDraftFindUnique.mockResolvedValue({
      id: 'd',
      content: 'existing content',
      readyToShare: true,
    });

    const result = await markDraftReadyToShare('sess-1', 'user-1');

    expect(result.status).toBe('already_ready');
    expect(result.draftContent).toBe('existing content');
    expect(empathyDraftUpdate).not.toHaveBeenCalled();
  });

  it('uses the (sessionId, userId) composite key for lookup', async () => {
    empathyDraftFindUnique.mockResolvedValue(null);
    await markDraftReadyToShare('sess-abc', 'user-xyz');
    expect(empathyDraftFindUnique).toHaveBeenCalledWith({
      where: { sessionId_userId: { sessionId: 'sess-abc', userId: 'user-xyz' } },
      select: { id: true, content: true, readyToShare: true },
    });
  });
});
