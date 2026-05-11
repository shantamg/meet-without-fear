import { MessageRole } from '@meet-without-fear/shared';
import type { EmpathyAttemptDTO, MessageDTO } from '@meet-without-fear/shared';
import {
  hasNewerDistinctEmpathyStatement,
  isSameEmpathyAttemptMessage,
} from '../empathyMessageMatching';

describe('empathy message matching', () => {
  const baseMessage: Pick<MessageDTO, 'id' | 'role' | 'senderId' | 'content' | 'timestamp'> = {
    id: 'message-1',
    senderId: 'james',
    role: MessageRole.EMPATHY_STATEMENT,
    content: 'I can see that you felt alone and dismissed.',
    timestamp: '2026-05-11T18:00:00.250Z',
  };

  const baseAttempt: Pick<EmpathyAttemptDTO, 'content' | 'sharedAt'> = {
    content: baseMessage.content,
    sharedAt: '2026-05-11T18:00:00.000Z',
  };

  it('matches the first empathy message when message timestamp differs slightly from sharedAt', () => {
    expect(isSameEmpathyAttemptMessage(baseMessage, 'james', baseAttempt)).toBe(true);
  });

  it('does not match a different empathy statement from a later revision', () => {
    expect(isSameEmpathyAttemptMessage(
      {
        ...baseMessage,
        id: 'message-2',
        content: 'I can see that you felt alone, dismissed, and unsure I was with you.',
        timestamp: '2026-05-11T18:02:00.000Z',
      },
      'james',
      baseAttempt,
    )).toBe(false);
  });

  it('does not mark a duplicate first-share message as superseded', () => {
    const duplicateMessage = {
      ...baseMessage,
      id: 'message-duplicate',
      timestamp: '2026-05-11T18:00:00.500Z',
    };

    expect(hasNewerDistinctEmpathyStatement(baseMessage, [baseMessage, duplicateMessage])).toBe(false);
  });

  it('marks an older empathy message as superseded when a newer distinct revision exists', () => {
    const revisedMessage = {
      ...baseMessage,
      id: 'message-2',
      content: 'I can see that you felt alone, dismissed, and unsure I was with you.',
      timestamp: '2026-05-11T18:02:00.000Z',
    };

    expect(hasNewerDistinctEmpathyStatement(baseMessage, [baseMessage, revisedMessage])).toBe(true);
  });
});
