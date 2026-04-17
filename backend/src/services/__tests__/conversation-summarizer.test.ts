/**
 * Conversation Summarizer Tests
 *
 * Focus: the `lastUnresolvedThread` extension + `SummarizationHints` that
 * prevent hallucinated cliffhangers when users reach milestones or haven't
 * paired yet. Prisma and Haiku are mocked so no external dependencies.
 */

const sessionFindUnique = jest.fn();
const userVesselUpdate = jest.fn();
const getHaikuJsonMock = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    session: { findUnique: sessionFindUnique },
    userVessel: { update: userVesselUpdate },
  },
}));

jest.mock('../../lib/bedrock', () => ({
  getHaikuJson: (...args: unknown[]) => getHaikuJsonMock(...args),
  BrainActivityCallType: { SUMMARIZATION: 'SUMMARIZATION' },
}));

import { updateSessionSummary } from '../conversation-summarizer';

function buildSessionFixture(overrides: Partial<{
  messageCount: number;
  existingSummary: string | null;
}> = {}) {
  const { messageCount = 30, existingSummary = null } = overrides;
  const now = new Date();
  const messages = Array.from({ length: messageCount }).map((_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'USER' : 'AI',
    content: `message ${i} with enough content to make token estimation meaningful`,
    timestamp: new Date(now.getTime() - (messageCount - i) * 60_000),
    senderId: i % 2 === 0 ? 'user-1' : null,
    forUserId: 'user-1',
  }));

  return {
    id: 'session-1',
    messages,
    relationship: {
      members: [
        { userId: 'user-1', nickname: null, user: { name: 'Alice', firstName: 'Alice' } },
        { userId: 'user-2', nickname: 'Bob', user: { name: 'Bob', firstName: 'Bob' } },
      ],
    },
    userVessels: [
      { id: 'vessel-1', userId: 'user-1', conversationSummary: existingSummary },
    ],
    stageProgress: [{ stage: 1, userId: 'user-1' }],
  };
}

describe('conversation-summarizer — lastUnresolvedThread + hints', () => {
  beforeEach(() => {
    sessionFindUnique.mockReset();
    userVesselUpdate.mockReset();
    getHaikuJsonMock.mockReset();
    userVesselUpdate.mockResolvedValue({});
  });

  it('persists lastUnresolvedThread from the Haiku output', async () => {
    sessionFindUnique.mockResolvedValue(buildSessionFixture());
    getHaikuJsonMock.mockResolvedValue({
      summary: 'summary text',
      keyThemes: ['theme1'],
      emotionalJourney: 'journey',
      unresolvedTopics: ['topic1'],
      lastUnresolvedThread: 'Alice was still sitting with the feeling that trust had been eroding.',
    });

    await updateSessionSummary('session-1', 'user-1', 'turn-1');

    expect(userVesselUpdate).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      (userVesselUpdate.mock.calls[0][0] as { data: { conversationSummary: string } }).data
        .conversationSummary
    );
    expect(saved.lastUnresolvedThread).toContain('trust had been eroding');
  });

  it('forces lastUnresolvedThread to null when stageJustAdvanced (defense-in-depth)', async () => {
    sessionFindUnique.mockResolvedValue(buildSessionFixture());
    getHaikuJsonMock.mockResolvedValue({
      summary: 'summary text',
      keyThemes: [],
      emotionalJourney: 'journey',
      unresolvedTopics: [],
      // Model lapses and emits a cliffhanger despite the instruction:
      lastUnresolvedThread: 'Phantom unresolved tension the model invented',
    });

    await updateSessionSummary('session-1', 'user-1', 'turn-1', {
      stageJustAdvanced: true,
    });

    const saved = JSON.parse(
      (userVesselUpdate.mock.calls[0][0] as { data: { conversationSummary: string } }).data
        .conversationSummary
    );
    expect(saved.lastUnresolvedThread).toBeNull();
  });

  it('persists null when Haiku omits the field entirely', async () => {
    sessionFindUnique.mockResolvedValue(buildSessionFixture());
    getHaikuJsonMock.mockResolvedValue({
      summary: 'summary text',
      keyThemes: [],
      emotionalJourney: 'journey',
      unresolvedTopics: [],
      // no lastUnresolvedThread key at all
    });

    await updateSessionSummary('session-1', 'user-1', 'turn-1');

    const saved = JSON.parse(
      (userVesselUpdate.mock.calls[0][0] as { data: { conversationSummary: string } }).data
        .conversationSummary
    );
    expect(saved.lastUnresolvedThread).toBeNull();
  });

  it('includes solo-framing instruction in the system prompt when partner has not joined', async () => {
    sessionFindUnique.mockResolvedValue(buildSessionFixture());
    getHaikuJsonMock.mockResolvedValue({
      summary: 'summary',
      keyThemes: [],
      emotionalJourney: '',
      unresolvedTopics: [],
      lastUnresolvedThread: null,
    });

    await updateSessionSummary('session-1', 'user-1', 'turn-1', {
      partnerStatus: 'not_joined',
    });

    expect(getHaikuJsonMock).toHaveBeenCalledTimes(1);
    const systemPrompt = (getHaikuJsonMock.mock.calls[0][0] as { systemPrompt: string }).systemPrompt;
    expect(systemPrompt).toContain('has not yet joined this session');
    expect(systemPrompt).toContain('internal processing');
    expect(systemPrompt).toContain('do NOT anticipate a direct partner response');
  });

  it('includes milestone instruction when stageJustAdvanced is true', async () => {
    sessionFindUnique.mockResolvedValue(buildSessionFixture());
    getHaikuJsonMock.mockResolvedValue({
      summary: 'summary',
      keyThemes: [],
      emotionalJourney: '',
      unresolvedTopics: [],
    });

    await updateSessionSummary('session-1', 'user-1', 'turn-1', {
      stageJustAdvanced: true,
    });

    const systemPrompt = (getHaikuJsonMock.mock.calls[0][0] as { systemPrompt: string }).systemPrompt;
    expect(systemPrompt).toContain('milestone reached');
    expect(systemPrompt).toContain('MUST be null');
  });

  it('omits structural hints when none are provided', async () => {
    sessionFindUnique.mockResolvedValue(buildSessionFixture());
    getHaikuJsonMock.mockResolvedValue({
      summary: 'summary',
      keyThemes: [],
      emotionalJourney: '',
      unresolvedTopics: [],
    });

    await updateSessionSummary('session-1', 'user-1', 'turn-1');

    const systemPrompt = (getHaikuJsonMock.mock.calls[0][0] as { systemPrompt: string }).systemPrompt;
    expect(systemPrompt).not.toContain('STRUCTURAL CONTEXT');
  });
});
