import {
  MessageRole,
  Stage4SubChatAnchor,
} from '@meet-without-fear/shared';

jest.mock('../../lib/prisma');
jest.mock('../../lib/bedrock', () => ({
  getCompletion: jest.fn(),
}));

import { prisma } from '../../lib/prisma';
import { getCompletion } from '../../lib/bedrock';
import {
  appendUserMessageAndRespond,
  buildSystemPrompt,
  loadAnchorContext,
  openOrGetActiveSubChat,
  resolveSubChat,
} from '../stage4-subchat.service';

const sessionId = 'session-1';
const userId = 'user-1';

beforeEach(() => {
  jest.clearAllMocks();
  // Reasonable default empty findMany so prompt builds without errors.
  (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.stage4ProposalSelection.findMany as jest.Mock).mockResolvedValue([]);
});

describe('openOrGetActiveSubChat', () => {
  it('returns existing ACTIVE sub-chat for the same anchor (no duplicate creation)', async () => {
    (prisma.stage4SubChat.findFirst as jest.Mock).mockResolvedValue({
      id: 'sub-1',
      sessionId,
      userId,
      anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
      anchorId: 'need-1',
      status: 'ACTIVE',
      createdAt: new Date(),
      resolvedAt: null,
      messages: [],
    });

    const result = await openOrGetActiveSubChat({
      sessionId,
      userId,
      anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
      anchorId: 'need-1',
    });

    expect(result.id).toBe('sub-1');
    expect(prisma.stage4SubChat.create).not.toHaveBeenCalled();
  });

  it('creates a new sub-chat when none is active for the anchor', async () => {
    (prisma.stage4SubChat.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.stage4SubChat.create as jest.Mock).mockResolvedValue({
      id: 'sub-new',
      sessionId,
      userId,
      anchorKind: Stage4SubChatAnchor.NO_OVERLAP,
      anchorId: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      resolvedAt: null,
      messages: [],
    });

    const result = await openOrGetActiveSubChat({
      sessionId,
      userId,
      anchorKind: Stage4SubChatAnchor.NO_OVERLAP,
    });

    expect(prisma.stage4SubChat.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('sub-new');
  });
});

describe('buildSystemPrompt', () => {
  it('includes main-chat history in the system prompt', async () => {
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { role: 'USER', content: 'I want to feel like myself in this marriage.' },
      { role: 'AI', content: 'Tell me more about that.' },
    ]);

    const { systemPrompt, mainChatTranscript } = await buildSystemPrompt({
      sessionId,
      userId,
      anchor: {
        anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
        needLabel: 'feeling like myself inside this marriage',
      },
      anchorId: 'need-1',
    });

    expect(mainChatTranscript).toContain('I want to feel like myself');
    expect(systemPrompt).toContain('--- MAIN CHAT HISTORY ---');
    expect(systemPrompt).toContain('I want to feel like myself');
    expect(systemPrompt).toContain('feeling like myself inside this marriage');
  });
});

describe('loadAnchorContext', () => {
  it('loads need label for NEEDS_BRAINSTORM anchor', async () => {
    (prisma.identifiedNeed.findUnique as jest.Mock).mockResolvedValue({
      need: 'connection',
    });
    const ctx = await loadAnchorContext(sessionId, Stage4SubChatAnchor.NEEDS_BRAINSTORM, 'need-1');
    expect(ctx.needLabel).toBe('connection');
  });

  it('loads description for PROPOSAL_REFINEMENT anchor', async () => {
    (prisma.strategyProposal.findUnique as jest.Mock).mockResolvedValue({
      description: 'walk together each evening',
    });
    const ctx = await loadAnchorContext(
      sessionId,
      Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
      'prop-1'
    );
    expect(ctx.proposalDescription).toBe('walk together each evening');
  });
});

describe('appendUserMessageAndRespond', () => {
  it('appends user + AI messages, passes built system prompt to LLM', async () => {
    (prisma.stage4SubChat.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'sub-1',
      sessionId,
      userId,
      anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
      anchorId: 'need-1',
      status: 'ACTIVE',
      createdAt: new Date(),
      resolvedAt: null,
      messages: [],
    });
    (prisma.identifiedNeed.findUnique as jest.Mock).mockResolvedValue({ need: 'connection' });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { role: 'USER', content: 'background context from main chat' },
    ]);
    (getCompletion as jest.Mock).mockResolvedValue('Try a 10-minute walk together?');
    // Final refresh inside service:
    (prisma.stage4SubChat.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'sub-1',
      sessionId,
      userId,
      anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
      anchorId: 'need-1',
      status: 'ACTIVE',
      createdAt: new Date(),
      resolvedAt: null,
      messages: [
        { id: 'm1', role: MessageRole.USER, content: 'hi', createdAt: new Date() },
        {
          id: 'm2',
          role: MessageRole.AI,
          content: 'Try a 10-minute walk together?',
          createdAt: new Date(),
        },
      ],
    });

    const result = await appendUserMessageAndRespond({
      subChatId: 'sub-1',
      userId,
      content: 'hi',
    });

    expect(prisma.stage4SubChatMessage.create).toHaveBeenCalledTimes(2);
    expect(getCompletion).toHaveBeenCalledTimes(1);
    const calledWith = (getCompletion as jest.Mock).mock.calls[0][0];
    expect(calledWith.systemPrompt).toContain('background context from main chat');
    expect(result.messages.length).toBe(2);
  });
});

describe('resolveSubChat', () => {
  it('creates new proposals for NEEDS_BRAINSTORM acceptedProposals, linked to anchor need', async () => {
    (prisma.stage4SubChat.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'sub-1',
        sessionId,
        userId,
        anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
        anchorId: 'need-1',
        status: 'ACTIVE',
      })
      .mockResolvedValueOnce({
        id: 'sub-1',
        sessionId,
        userId,
        anchorKind: Stage4SubChatAnchor.NEEDS_BRAINSTORM,
        anchorId: 'need-1',
        status: 'RESOLVED',
        createdAt: new Date(),
        resolvedAt: new Date(),
        messages: [],
      });
    (prisma.strategyProposal.create as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve({ id: 'new-prop-1', ...args.data })
    );
    (prisma.identifiedNeed.findUnique as jest.Mock).mockResolvedValue({
      id: 'need-1',
      need: 'a clean lawn',
    });

    const result = await resolveSubChat({
      subChatId: 'sub-1',
      userId,
      acceptedProposals: [
        { description: 'walk together each evening' },
      ],
    });

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    const callArgs = (prisma.strategyProposal.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.data.needsAddressed).toEqual(['a clean lawn']);
    expect(callArgs.data.description).toBe('walk together each evening');
    expect(result.createdProposalIds).toEqual(['new-prop-1']);
    expect(prisma.strategyProposalNeed.create).toHaveBeenCalledWith({
      data: { proposalId: 'new-prop-1', needId: 'need-1' },
    });
    expect(prisma.stage4SubChat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ status: 'RESOLVED' }),
      })
    );
  });

  it('updates existing proposals in place for PROPOSAL_REFINEMENT (selections preserved)', async () => {
    (prisma.stage4SubChat.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'sub-2',
        sessionId,
        userId,
        anchorKind: Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
        anchorId: 'prop-1',
        status: 'ACTIVE',
      })
      .mockResolvedValueOnce({
        id: 'sub-2',
        sessionId,
        userId,
        anchorKind: Stage4SubChatAnchor.PROPOSAL_REFINEMENT,
        anchorId: 'prop-1',
        status: 'RESOLVED',
        createdAt: new Date(),
        resolvedAt: new Date(),
        messages: [],
      });
    (prisma.strategyProposal.update as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve({ id: args.where.id, ...args.data })
    );

    const result = await resolveSubChat({
      subChatId: 'sub-2',
      userId,
      updatedProposals: [
        { proposalId: 'prop-1', description: 'walk together for 20 minutes' },
      ],
    });

    expect(prisma.strategyProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop-1' },
        data: expect.objectContaining({ description: 'walk together for 20 minutes' }),
      })
    );
    expect(prisma.stage4ProposalSelection.deleteMany).not.toHaveBeenCalled();
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalled();
    expect(result.updatedProposalIds).toEqual(['prop-1']);
  });
});
