import { MessageRole } from '@meet-without-fear/shared';

jest.mock('../../lib/api', () => ({
  post: jest.fn(),
}));

jest.mock('../useStages', () => ({
  useRefineValidationFeedback: jest.fn(),
  useSaveValidationFeedbackDraft: jest.fn(),
}));

import {
  buildValidationFeedbackRefinementPayload,
  type RefinementMessage,
} from '../useRefinementChat';

describe('buildValidationFeedbackRefinementPayload', () => {
  it('wraps the initial feedback with partner context', () => {
    const payload = buildValidationFeedbackRefinementPayload(
      'He was drunk with poop in his pants',
      [],
      'You felt worried at drop-off'
    );

    expect(payload).toEqual({
      message: [
        'Partner empathy statement:\n"You felt worried at drop-off"',
        'What feels off:\n"He was drunk with poop in his pants"',
        'Help me turn this into feedback I can send.',
      ].join('\n\n'),
    });
  });

  it('sends follow-up corrections as-is with prior coach context', () => {
    const priorMessages: RefinementMessage[] = [
      {
        id: 'rough',
        sessionId: 'session-123',
        role: MessageRole.USER,
        content: 'He was drunk with poop in his pants',
        timestamp: '2026-05-02T00:00:00.000Z',
        senderId: 'me',
        stage: 2,
      },
      {
        id: 'coach',
        sessionId: 'session-123',
        role: MessageRole.AI,
        content: 'I hear you.',
        proposedContent: 'I felt concerned about serious incidents at drop-off.',
        timestamp: '2026-05-02T00:00:01.000Z',
        senderId: null,
        stage: 2,
      },
    ];

    const payload = buildValidationFeedbackRefinementPayload(
      "No, don't water that down",
      priorMessages,
      'You felt worried at drop-off'
    );

    expect(payload).toEqual({
      message: "No, don't water that down",
      history: [
        { role: 'user', content: 'He was drunk with poop in his pants' },
        {
          role: 'coach',
          content: 'I hear you.\n\nProposed feedback: I felt concerned about serious incidents at drop-off.',
        },
      ],
    });
  });
});
