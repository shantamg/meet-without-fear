import { normalizeTopicFrame } from '../topic-frame';

jest.mock('../../lib/prisma', () => ({
  prisma: {},
}));

jest.mock('../../utils/session', () => ({
  isSessionCreator: jest.fn(),
}));

jest.mock('../../lib/bedrock', () => ({
  getSonnetResponse: jest.fn(),
  BrainActivityCallType: { ORCHESTRATED_RESPONSE: 'ORCHESTRATED_RESPONSE' },
}));

describe('normalizeTopicFrame', () => {
  it('accepts concise two-word topic frames', () => {
    expect(normalizeTopicFrame('Mealtime poking')).toBe('Mealtime poking');
  });

  it('strips labels, quotes, bullets, and terminal punctuation from final lines', () => {
    const response = [
      'Candidate 1: Mealtime poking.',
      'Candidate 2: Personal space at meals.',
      '- Final topic frame: "Mealtime personal space."',
    ].join('\n');

    expect(normalizeTopicFrame(response)).toBe('Mealtime personal space');
  });

  it('still rejects long explanatory final lines', () => {
    expect(
      normalizeTopicFrame('The final topic is about repeated poking during meals and boundaries')
    ).toBeNull();
  });

  it('falls back to the last valid candidate if the model omits a final answer', () => {
    const response = [
      'Let me think through several candidate topic frames:',
      '',
      '**Candidate 1: "Mealtime behavior concerns"**',
      'Critique: Too clinical.',
      '',
      '**Candidate 2: "What happens during meals"**',
      'Critique: Conversational and neutral.',
    ].join('\n');

    expect(normalizeTopicFrame(response)).toBe('What happens during meals');
  });
});
