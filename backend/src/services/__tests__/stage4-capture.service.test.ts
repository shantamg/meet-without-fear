import {
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';
import { prisma } from '../../lib/prisma';
import { captureStage4Turn } from '../stage4-capture.service';

jest.mock('../../lib/prisma');

const sessionId = 'session-1';
const userId = 'user-1';
const messageId = 'message-1';

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proposal-1',
    sessionId,
    createdByUserId: userId,
    description: '10-minute check-in after dinner for one week',
    needsAddressed: [],
    duration: null,
    measureOfSuccess: null,
    kind: Stage4ProposalKind.SHARED_PROPOSAL,
    status: Stage4ProposalStatus.ACTIVE,
    removedAt: null,
    removedByUserId: null,
    removalReason: null,
    updatedAt: new Date('2026-05-06T12:00:00.000Z'),
    ...overrides,
  };
}

function captureInput(overrides: Partial<Parameters<typeof captureStage4Turn>[0]> = {}) {
  return {
    sessionId,
    userId,
    messageId,
    userMessage: 'I can send a Sunday planning text each week for a month.',
    aiResponse: 'That is concrete enough to hold as an option.',
    ...overrides,
  };
}

describe('stage4-capture.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.strategyProposal.create as jest.Mock).mockResolvedValue({
      id: 'created-proposal',
    });
  });

  it('adds individual commitments from first-person user phrasing', async () => {
    const result = await captureStage4Turn(captureInput());

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId,
        createdByUserId: userId,
        description: 'send a Sunday planning text each week for a month',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        status: Stage4ProposalStatus.ACTIVE,
        capturedFromMessageId: messageId,
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'created-proposal',
        action: 'CREATED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('does not turn observations into individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I can see the trip and curiosity pieces matter for Eve.',
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('does not turn caveats into individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'If even that becomes too much, then I would worry this is still only theoretical.',
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it.each([
    "I want to see what Catherine put on the table. I'm not promising I'll agree with all of it.",
    "I want to know what she's actually asking for.",
    'Okay. I want to see what she actually brings forward.',
    'I can talk about that if she has proposals too.',
  ])('does not capture process-review language as proposals: %s', async (userMessage) => {
    const result = await captureStage4Turn(captureInput({ userMessage }));

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('keeps ProposedStrategy micro-tags as a compatibility add fallback', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That sounds right.',
        compatibilityProposedStrategies: ['10-minute check-in after dinner each night for one week'],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: '10-minute check-in after dinner each night for one week',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('normalizes parenthetical proposal kind labels from compatibility tags', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Saturday morning alone in garage or on a project to practice feeling steady independently (individual commitment)',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Saturday morning alone in garage or on a project to practice feeling steady independently',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('skips measure and caveat fragments from compatibility tags', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'After one month check-in: did we feel more present and less afraid next to each other',
          'try together, and a way to check whether we are actually less afraid with each other',
          'want us to agree before we start that it is not where we decide the whole marriage',
          'name one want or curiosity without it turning into a verdict on our whole life',
          'want it to feel contained, maybe thirty minutes, not an endless processing night',
          'actually try',
          'try is a weekly conversation with a clear container',
          'ask a few questions before defending or going quiet',
          'honestly name right now',
          'see what actually overlaps, and I also want it to be okay if some things are still open',
          'be together without everything becoming a verdict',
          'talk about ordinary things, or say nothing for parts of it',
          "want to learn whether I can stay present without turning Eve's wanting into a verdict",
          'learn whether I can build steadiness somewhere inside my own life, not just wait for her to reassure me',
          'own the Saturday morning one either way',
          'want it to be a one-month experiment, not a promise that we have solved everything',
          '— and I do not have to turn it into a referendum on us first',
          'keep it that small and real',
          'After one month, they check in honestly on whether Eve feels more like herself and whether Adam feels less like her wanting is an emergency',
          'ask what helped, what did not, and whether we want to keep any of it',
          'think we understood each other when maybe we just survived the conversation',
          'know it was helping if I came back less urgent, less like I need her to immediately prove we are okay',
          'stay more present if I knew we were not deciding the whole future every time',
          'agree to these for four weeks and then actually look at whether they helped',
          'agree to practice it',
          'try to treat it as a pause instead of abandonment',
          'talk through the shared version',
          'try not to chase it',
          'turn it into another thing to manage',
          'commit to once a week for the same four weeks',
          'feel myself starting to brace',
          'work with: the Sunday thirty-minute conversation and the one bounded Saturday afternoon outing',
          'say if I am anxious, but I still show up unless there is a real reason not to',
          'probably turn it into another thing to get right',
          "Small ways for Eve to bring newness into their life without Adam treating every idea like she's leaving",
          'want us to pick one thing each of us is carrying that week',
          'want to feel a little less alone with the question of our future',
          'know if I start saying things before I have edited them down to something safe',
          'say what I am reaching for and he can say what scares him, without either of us turning it into a verdict',
          'know it helped if she could say the thing without softening it first, and I could ask at least one real question before defending myself',
          'turn it into another thing I can fail at',
          'solve that in advance',
          'actually do the Sunday conversation, and whether I can take one small step toward my own life without turning it into a fight',
          'take ten minutes but I have to come back',
          'do small movement',
          "say is, 'I need ten minutes and I will come back.' And I can try to ask one real question before I defend myself",
          'understand it without turning it into the entire marriage',
          'work on the panic instead of putting all of it into whether Eve is okay',
          "keep asking her to prove I'm enough",
          'look at what Eve is thinking about and see what is actually possible from here',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('classifies individual steadiness practices as individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'These are mine to work on.',
        compatibilityProposedStrategies: [
          "Finding something outside the relationship (individual practice/resource) to build internal steadiness so conversations with Eve don't carry the weight of proving self-worth",
          "When panic starts, take a walk, write down what I'm afraid I just heard, then come back with one honest sentence instead of a wall",
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(2);
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        description:
          "Finding something outside the relationship (individual practice/resource) to build internal steadiness so conversations with Eve don't carry the weight of proving self-worth",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        description:
          "When panic starts, take a walk, write down what I'm afraid I just heard, then come back with one honest sentence instead of a wall",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(2);
  });

  it('deduplicates same-turn Stage 4 compatibility fragments by proposal family', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Saturday morning individual time block for Adam to do something with his hands or a project that reminds him he can feel steady without needing Eve to reassure him',
          'feel steady without needing Eve to reassure me',
          'Sign up for Tuesday evening ceramics class for one term',
          'sign up for the ceramics class I keep talking myself out of',
          'Weekly walk outside with no agenda for one month',
          'like a weekly walk outside with no agenda',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(3);
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        description:
          'Saturday morning individual time block for Adam to do something with his hands or a project that reminds him he can feel steady without needing Eve to reassure him',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        description: 'Sign up for Tuesday evening ceramics class for one term',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(3, {
      data: expect.objectContaining({
        description: 'Weekly walk outside with no agenda for one month',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(3);
  });

  it('deduplicates first-response question proposal variants', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          "When Eve brings up something she wants (trip, class, change), Adam asks what it means to her before deciding whether it is practical or scary - first response is not a verdict but a real question",
          "When Eve brings up a want, Adam asks what it means to her before deciding if it's practical or scary - first response should be a real question, not a verdict",
          'When Eve brings up a want, Adam asks what it means to her before deciding if it is practical or scary - first response is a real question not a verdict',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description:
          "When Eve brings up something she wants (trip, class, change), Adam asks what it means to her before deciding whether it is practical or scary - first response is not a verdict but a real question",
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('deduplicates structured Sunday conversation variants from Stage 4 refinements', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels like the version to offer.',
        compatibilityProposedStrategies: [
          "One structured conversation on Sunday evening, 20-30 minutes, each person brings one specific thing, agree at the start not to decide the whole future that night, if overwhelmed can ask for 10-minute pause but must name exactly when coming back and return at that time, focus on understanding first not proving who's right",
          "One 20-30 minute structured conversation each Sunday evening before the week starts, where each person brings one specific thing. Agree at the start that we're not deciding the whole future that night. If Adam gets overwhelmed, he can ask for ten minutes but must name exactly when he's coming back. The point is understanding first, not proving whose version is right. Success markers: Eve can say the thing without softening it first, Adam asks at least one real question before defending himself, and if Adam pauses he actually comes back when he said he would",
          "Try it once first as a trial, not a forever plan; set a timer, pick something specific; if Adam asks for a pause he says exactly when he's coming back; both remember the point is understanding first, not proving whose version of life is right",
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description:
          "One structured conversation on Sunday evening, 20-30 minutes, each person brings one specific thing, agree at the start not to decide the whole future that night, if overwhelmed can ask for 10-minute pause but must name exactly when coming back and return at that time, focus on understanding first not proving who's right",
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(2);
  });

  it('classifies self-owned one-small-thing autonomy actions as individual', async () => {
    const strategy =
      'Eve picks one small thing this month that is just hers (a class, a morning out, something she does because she wants to) and does it without turning it into a referendum on the relationship first. Adam can know about it, but does not get to make her wanting feel dangerous before she even begins';
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [strategy],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: strategy,
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('classifies just-for-partner class or trip planning actions as individual', async () => {
    const strategy =
      'Something just for Eve - signing up for a class or planning one real trip idea on paper without needing permission';

    await captureStage4Turn(
      captureInput({
        userMessage: 'Those belong to Eve alone.',
        compatibilityProposedStrategies: [strategy],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: strategy,
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
  });

  it('deduplicates latest Adam personal-time variants and skips outcome fragments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are personal practices, not shared agreements.',
        compatibilityProposedStrategies: [
          'Something that is just mine, outside of whether Eve feels okay with our life that week',
          'Saturday mornings as protected personal time (walk, coffee, brother, something physical)',
          "Saturday mornings protected as Adam's own time for walks, coffee, meeting his brother, or something physical - something where he is not waiting to see whether the house feels okay before he knows he is okay",
          'know it is helping if I can stay present without freezing and if Eve does not have to shrink what she says just to keep me steady',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Saturday mornings as protected personal time (walk, coffee, brother, something physical)',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'created-proposal' },
      data: expect.objectContaining({
        description:
          "Saturday mornings protected as Adam's own time for walks, coffee, meeting his brother, or something physical - something where he is not waiting to see whether the house feels okay before he knows he is okay",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(2);
  });

  it('deduplicates latest Eve class-trip variants and skips waiting fragments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That should stay on Eve side.',
        compatibilityProposedStrategies: [
          'One class or trip-planning block each week that Eve chooses without pre-approval',
          "One class or trip-planning block each week that is Eve's alone, chosen without pre-justifying reasonableness",
          'choose without waiting for Adam to be ready',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'One class or trip-planning block each week that Eve chooses without pre-approval',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'created-proposal' },
      data: expect.objectContaining({
        description:
          "One class or trip-planning block each week that is Eve's alone, chosen without pre-justifying reasonableness",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(2);
  });

  it('classifies yours-only choice proposals as individual commitments', async () => {
    const strategy = 'One small yours-only thing Eve chooses, does, and shares as information (not permission)';

    await captureStage4Turn(
      captureInput({
        userMessage: 'That one belongs to Eve.',
        compatibilityProposedStrategies: [strategy],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: strategy,
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
  });

  it('classifies explicit individual and private-note commitments as individual', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are private commitments, not shared asks.',
        compatibilityProposedStrategies: [
          'Adam commits individually to ask one real question before defending himself',
          'Keep a private weekly note for four weeks tracking one place user edited herself before speaking and whether that was an actual choice',
          'keep a private note once a week for the same four weeks: one place I edited myself before I spoke, and whether I actually chose that',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(2);
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        description: 'Adam commits individually to ask one real question before defending himself',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        description:
          'Keep a private weekly note for four weeks tracking one place user edited herself before speaking and whether that was an actual choice',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(3);
  });

  it('deduplicates outside-relationship steadiness commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is mine to work on.',
        compatibilityProposedStrategies: [
          "Adam developing something that is his, outside of Eve, so his sense of worth isn't entirely dependent on whether she feels settled",
          "Adam will identify something meaningful outside of Eve so his sense of worth isn't dependent on whether she seems settled",
          "Something outside of Eve for Adam's own sense of worth (running or individual counseling to work on panic instead of asking Eve to prove he's enough)",
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description:
          "Adam developing something that is his, outside of Eve, so his sense of worth isn't entirely dependent on whether she feels settled",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(2);
  });

  it('deduplicates weekly understanding check variants and keeps solo grounding individual', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Weekly understanding check — Weekly, thirty minutes, each person shares one thing (good or hard, their choice). The other person mirrors it back. Before either tries to fix or decide anything, the person who shared has to say "yes, that\'s what I meant." Four weeks to start',
          'Weekly understanding check: 30 minutes, one thing each, mirror back what was heard and get confirmation before moving forward, four weeks',
          'Weekly 30-minute conversation (one thing each), goal is understanding not fixing/deciding, mirror back what you heard and partner confirms "yes that\'s what I meant" before moving forward, if not there yet stay with understanding longer, commit to trying this for four weeks',
          "Solo grounding practice — Adam takes a solo walk with no phone, then writes down what he's afraid is being threatened before bringing it to Eve. Weekly for four weeks, and also before difficult conversations when he can feel himself starting to brace",
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(2);
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        description:
          'Weekly understanding check — Weekly, thirty minutes, each person shares one thing (good or hard, their choice). The other person mirrors it back. Before either tries to fix or decide anything, the person who shared has to say "yes, that\'s what I meant." Four weeks to start',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        description:
          "Solo grounding practice — Adam takes a solo walk with no phone, then writes down what he's afraid is being threatened before bringing it to Eve. Weekly for four weeks, and also before difficult conversations when he can feel himself starting to brace",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(2);
  });

  it('removes a referenced proposal and records revision history', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([proposal()]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Take that proposal off.',
      })
    );

    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        status: Stage4ProposalStatus.REMOVED,
        removedByUserId: userId,
        removalReason: 'Take that proposal off.',
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'proposal-1',
        action: 'REMOVED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('revises a misclassified shared proposal to an individual commitment', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'two hours on Saturday mornings for four weeks doing something I build or make',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage:
          'Small adjustment: the Saturday morning making/building idea should be individual for me, not shared. Eve does not need to participate or approve it.',
      })
    );

    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
        status: Stage4ProposalStatus.ACTIVE,
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'proposal-1',
        action: 'REVISED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('revises semantically superseded proposal drafts instead of adding duplicates', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "weekly conversation where Eve names one thing she is wanting or curious about, and Adam's first job is to ask what it means to her",
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage:
          "I think I could try a weekly conversation where I name one thing I am wanting or curious about, and Adam's first job is just to ask what it means to me before defending what we already have.",
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          "try a weekly conversation where I name one thing I am wanting or curious about, and Adam's first job is just to ask what it means to me before defending what we already have",
        status: Stage4ProposalStatus.ACTIVE,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('revises walk and hike proposal refinements instead of adding duplicate proposal-family rows', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'Weekly walk or hike together for one month, no agenda',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Sunday morning walk, 45 minutes, phones away, for one month — not where we decide the marriage, just where we practice being next to each other without turning every want into a trial (shared proposal)',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          'Sunday morning walk, 45 minutes, phones away, for one month — not where we decide the marriage, just where we practice being next to each other without turning every want into a trial',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
        status: Stage4ProposalStatus.ACTIVE,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('revises protected conversation refinements instead of adding duplicates', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          'One protected conversation each week where Eve can name one want or curiosity without it becoming a verdict',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Sunday evening, thirty minutes, phones away — Eve names one want without shrinking it, Adam names the fear before going quiet, no decisions in that conversation, either person can pause and come back the next day if it turns into blame',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          'Sunday evening, thirty minutes, phones away — Eve names one want without shrinking it, Adam names the fear before going quiet, no decisions in that conversation, either person can pause and come back the next day if it turns into blame',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('deduplicates live Sunday timed-conversation variants', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          'Once a week Sunday evening after dinner, 30-minute timed conversation where Eve names one want and Adam names the fear before silence',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Sunday evening after dinner, thirty minutes with a timer, Eve names one want without shrinking it, Adam names the fear before going quiet, no decisions in that conversation',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          'Sunday evening after dinner, thirty minutes with a timer, Eve names one want without shrinking it, Adam names the fear before going quiet, no decisions in that conversation',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
        status: Stage4ProposalStatus.ACTIVE,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('classifies live Saturday hands/steady commitment as individual', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Saturday mornings, two hours for a month, do something with my hands that helps me practice feeling steady independently',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description:
          'Saturday mornings, two hours for a month, do something with my hands that helps me practice feeling steady independently',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it.each([
    'Adam to identify one thing outside Eve that helps him feel steady before their next hard conversation',
    'Talking to someone other than Eve when Adam feels himself spiraling',
    "Weekly run or walk that is Adam's own time",
    "Individual practice for steadiness (running or counseling) - something Adam does on his own without needing Eve to prove he's okay",
  ])('classifies outside-partner steadiness as individual: %s', async (strategy) => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [strategy],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: strategy,
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('deduplicates individual steadiness practice variants from Stage 4 replay', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "Individual practice for steadiness (running or counseling) - something Adam does on his own without needing Eve to prove he's okay",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is mine to keep working on.',
        compatibilityProposedStrategies: [
          "Adam develops his own steadiness practice outside Eve through running or counseling so he isn't asking Eve to prove he's okay",
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          "Adam develops his own steadiness practice outside Eve through running or counseling so he isn't asking Eve to prove he's okay",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('deduplicates ceramics next-term individual commitment variants', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'Sign up for a ceramics class next term without asking permission first',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: ['sign up for the next term without asking permission first'],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(1);
  });

  it('revises motion action refinements instead of adding duplicates', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'One small motion-oriented action like choosing a class or short trip together',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          "One Saturday afternoon, two or three hours, within an hour of home — Eve picks a place she's curious about, Adam agrees not to treat it like a threat or referendum, no overnight, just go stay present and talk after about how it felt",
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          "One Saturday afternoon, two or three hours, within an hour of home — Eve picks a place she's curious about, Adam agrees not to treat it like a threat or referendum, no overnight, just go stay present and talk after about how it felt",
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it.each([
    'That comes off the list',
    'Take that off',
    'Remove that one',
    "I'm taking it back",
    "Let's drop that",
  ])('removes a semantically referenced proposal for phrasing: %s', async (userMessage) => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'kids conversation negotiation after dinner for one week',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: `${userMessage}. I mean the kids conversation negotiation.`,
      })
    );

    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        status: Stage4ProposalStatus.REMOVED,
        removedByUserId: userId,
        removalReason: `${userMessage}. I mean the kids conversation negotiation.`,
      }),
    });
    expect(prisma.stage4ProposalRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId: 'proposal-1',
        action: 'REMOVED',
        messageId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('does not apply low-confidence destructive captures', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({ id: 'proposal-1', description: '10-minute check-in after dinner for one week' }),
      proposal({ id: 'proposal-2', description: 'Sunday planning text for a month' }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Remove that idea.',
      })
    );

    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(1);
  });

  it('captures willingness as a selection without creating an agreement', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([proposal()]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: "I'm willing to try that.",
      })
    );

    expect(prisma.stage4ProposalSelection.upsert).toHaveBeenCalledWith({
      where: {
        proposalId_userId: {
          proposalId: 'proposal-1',
          userId,
        },
      },
      create: expect.objectContaining({
        proposalId: 'proposal-1',
        userId,
        decision: Stage4SelectionDecision.WILLING,
      }),
      update: expect.objectContaining({
        decision: Stage4SelectionDecision.WILLING,
      }),
    });
    expect(prisma.agreement.create).not.toHaveBeenCalled();
    expect(result.selection?.decisions[0]?.decision).toBe(Stage4SelectionDecision.WILLING);
  });

  it('does not treat generic done language as a Stage 4 closure signal', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I am done adding ideas for now.',
      })
    );

    expect(result.closureSignal).toBeUndefined();
  });

  it('captures explicit no-shared-agreement close language', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I want to close here without a shared agreement.',
      })
    );

    expect(result.closureSignal).toEqual(
      expect.objectContaining({
        readyToClose: true,
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
        reason: Stage4ClosureReason.USER_STOPPED,
      })
    );
  });

  it('captures explicit shared-strategy refusal as boundary-honored closure', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I am not looking for a shared strategy. I need space and a practical separation plan.',
      })
    );

    expect(result.closureSignal).toEqual(
      expect.objectContaining({
        readyToClose: true,
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
        reason: Stage4ClosureReason.BOUNDARY_HONORED,
      })
    );
  });

  it('captures shared repair refusal phrasing as boundary-honored closure', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'I am not ready to turn this into a shared repair plan. I need to protect emotional safety.',
      })
    );

    expect(result.closureSignal).toEqual(
      expect.objectContaining({
        readyToClose: true,
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
        reason: Stage4ClosureReason.BOUNDARY_HONORED,
      })
    );
  });

  it('does not capture boundary preambles or waiting phrases as proposals', async () => {
    const result = await captureStage4Turn(
      captureInput({
        compatibilityProposedStrategies: [
          'be careful here',
          'see what she does with it',
          'look at strategies, but I do not want this to become another version of trying one more communication tool while the underlying pattern stays intact',
          'be clear that curiosity is not agreement',
          'be clear that the therapy and writing things down are individual commitments, not a promise that I am staying',
          'see what actually works, then',
          'own that part',
          'own without getting into a whole trial about my character',
          "take the pause before I make it worse, that's already a lot",
          'do regardless of what James chooses',
        ],
        userMessage: 'I want to be careful here. I want to see what she does with it.',
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('classifies boundary self-permission proposals as individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That captures it.',
        compatibilityProposedStrategies: [
          'Give herself permission to make a decision even if James does not agree with her read',
          'Name what is happening once calmly and leave the conversation instead of staying to prove reality',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(2);
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        description: 'Give herself permission to make a decision even if James does not agree with her read',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(prisma.strategyProposal.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        description: 'Name what is happening once calmly and leave the conversation instead of staying to prove reality',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(result.appliedOperationCount).toBe(2);
  });

  it('classifies Catherine self-boundary and support ideas as individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is what I can carry.',
        compatibilityProposedStrategies: [
          'Name what I see once without debating my reality until James agrees',
          'Step away from conversations that turn into defending his character instead of accountability',
          'Return to individual therapy',
          'Catherine will pursue individual therapy',
          'Individual therapy for Catherine (self-trust not dependent on James validation)',
          'Journaling for Catherine (self-trust not dependent on James validation)',
          'Write down what I know when I start second-guessing myself',
          'Catherine will write things down to stop outsourcing her reality',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalled();
    for (const call of (prisma.strategyProposal.create as jest.Mock).mock.calls) {
      expect(call[0]).toEqual({
        data: expect.objectContaining({
          kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
          createdByUserId: userId,
        }),
      });
    }
    expect(result.appliedOperationCount).toBeGreaterThan(0);
  });

  it('deduplicates Catherine therapy and writing commitment variants', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          'commit to individual therapy and writing down what happened after hard conversations so I do not talk myself out of my own read',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is the individual work.',
        compatibilityProposedStrategies: [
          "Writing down what happened after hard conversations so she does not talk herself out of her own read (Catherine's individual commitment)",
          'Individual commitment (Catherine): writing down what happened after hard conversations',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount + result.skippedOperationCount).toBe(2);
  });

  it('deduplicates Catherine/James pause protocol refinements', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          'Pause agreement — if either person says a neutral word, the conversation stops immediately, no following or arguing the pause, and they only return when there can be accountability',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Use timeout for that.',
        compatibilityProposedStrategies: [
          'Either person can say "timeout" when voices go up or conversation turns to proving who is wrong; stop immediately, pick a time to return within 24 hours before anyone walks away',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount + result.skippedOperationCount).toBe(1);
  });

  it('skips extracted role-definition fragments that are not standalone proposals', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage:
          'I need us to define what I can step in on, what I stay out of, and what happens if she disagrees with me in the moment.',
        compatibilityProposedStrategies: [
          'step in on, what I stay out of, and what happens if she disagrees with me in the moment',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('deduplicates pause protocol and self-boundary proposal families', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          'When I start getting loud, I will say "I am getting too heated, I need twenty minutes," step away for twenty minutes, then come back and own what I can',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
      proposal({
        id: 'proposal-2',
        description: 'Name what I see once without debating my reality until James agrees',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'When I start getting loud, I will say "I am getting too heated, I need twenty minutes," step away for 20 minutes, then come back and own what I can',
          'Name what I see once without debating until James agrees',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount + result.skippedOperationCount).toBe(2);
  });

  it('deduplicates James/Catherine acknowledgment and kids-role proposal families', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          'Catherine acknowledges James a couple times a week when he picks up the kids, pays for something, fixes something, or shows up after work',
      }),
      proposal({
        id: 'proposal-2',
        description:
          "One conversation between James and Catherine to decide James's role with the kids, with disagreements handled later instead of in front of them",
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That feels right.',
        compatibilityProposedStrategies: [
          'Acknowledgment a couple times a week when James shows up — just "thank you for doing that" in the moment',
          "One conversation to clarify James's role with the kids, with agreement that if Catherine disagrees with how he handles something, she talks to him later instead of contradicting him in front of them",
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount + result.skippedOperationCount).toBe(2);
  });

  it('classifies Adam/Eve self-owned Stage 4 strategies as individual commitments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are the concrete next steps.',
        compatibilityProposedStrategies: [
          'Adam runs twice a week before work',
          'Tuesday evening ceramics class, beginner-level, something physical where she is not good at it yet',
          'Create one real Portugal itinerary without booking it yet',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(3);
    for (const call of (prisma.strategyProposal.create as jest.Mock).mock.calls) {
      expect(call[0]).toEqual({
        data: expect.objectContaining({
          kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
          createdByUserId: userId,
        }),
      });
    }
  });

  it('skips Adam/Eve Stage 4 process fragments and broad placeholders', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is enough.',
        compatibilityProposedStrategies: [
          'show up better then than after work when I am already tense and defensive',
          'feel myself wanting to add more because then it seems safer somehow, but these are real and concrete',
          'Adam to develop something that is his own outside of Eve so his sense of worth is not entirely dependent on whether she feels okay with their life',
          'Something that is just mine, like a class or making a real plan for a trip I have been quietly wanting, without waiting for permission first',
          'restart that twice a week, and maybe meet with Mark once a month instead of acting like Eve is the only place I can take my fear',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('classifies Adam self-practice run or therapy as an individual commitment', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is a real starting point.',
        compatibilityProposedStrategies: [
          'Weekly run or therapy appointment where Adam practices staying with fear instead of making Eve manage it',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description:
          'Weekly run or therapy appointment where Adam practices staying with fear instead of making Eve manage it',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('classifies therapist and mens group follow-through as individual support work', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is his to carry.',
        compatibilityProposedStrategies: [
          "Find three therapist/men's group options by Friday and send first email; Adam will let Eve know he did it but won't ask her to manage it",
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description:
          "Find three therapist/men's group options by Friday and send first email; Adam will let Eve know he did it but won't ask her to manage it",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('skips Adam/Eve Stage 4 timing and echo fragments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are fragments.',
        compatibilityProposedStrategies: [
          'start this week',
          'stay present better if I knew that going in',
          'say what we heard',
          'add that we try it for four weeks before deciding what it means',
          'know I am staying with it if I can say I am scared or defensive instead of just going quiet',
          'feel steady in myself again',
          'Find something that is mine, outside of whether Eve feels okay with our life (still forming - user acknowledges they do not know exactly what yet)',
          'think of is a weekly conversation that does not become a verdict',
          'know the rules before I walk in',
          "be open to that too, but I don't want to make a long list just to feel safer",
          'feel less scared',
          'ask to slow down without disappearing',
          'say I am scared and ask for five minutes instead of disappearing',
          'brace before we even start',
          'Willingness to try something new together (vague, needs refinement if pursued)',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(0);
  });

  it.each([
    'look at what we have',
    "look at what you've got so far",
    'look at what I got so far',
  ])('skips review-navigation language as a proposal: %s', async (compatibilityProposedStrategy) => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is not an idea.',
        compatibilityProposedStrategies: [compatibilityProposedStrategy],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('skips Adam/Eve success markers and reaction fragments from Stage 4', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are not standalone strategies.',
        compatibilityProposedStrategies: [
          'both say we feel less alone in it, not like one of us won and the other lost',
          'name when I am scared before I shut down, and if she does not have to make every want smaller before she says it',
          'like him not to make it heavy',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('classifies private self-editing check-ins as individual commitments and deduplicates variants', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is private work for me.',
        compatibilityProposedStrategies: [
          'Once a week, write down one moment where I made myself smaller and whether I actually chose it (private commitment)',
          'Private weekly check-in: write down one moment where she edited herself and whether she chose it',
          'notice when I edit myself before I even speak',
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Once a week, write down one moment where I made myself smaller and whether I actually chose it',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
    expect(result.skippedOperationCount).toBe(2);
  });

  it('deduplicates registration-deadline fragments into an existing ceramics commitment', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "Sign up for Tuesday evening ceramics class (eight weeks, one term) without requiring Adam's permission or turning it into a negotiation",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is the deadline.',
        compatibilityProposedStrategies: ['register by Friday and put it on the calendar'],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(1);
  });

  it('deduplicates generic real-itinerary variants into Portugal itinerary commitments', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'Research one real Portugal itinerary in the next two weeks and write it down',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is the same idea.',
        compatibilityProposedStrategies: ['research one real itinerary in the next two weeks and write it down'],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(1);
  });

  it('deduplicates weekly walk understanding variants', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "Weekly walk where we're outside, moving, and each share one real thing before going home - with the rule that it's not a decision meeting, each person names one true thing and the other reflects it back before responding, and if Adam freezes he says that out loud instead of disappearing",
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is the same shared idea.',
        compatibilityProposedStrategies: [
          'Weekly walk where each person names one true thing and the other reflects it back before responding. Not a decision meeting. If Adam freezes, he says it out loud. Four-week trial before evaluating',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(1);
  });

  it('deduplicates live Adam steadiness practice variants and skips folded fragments', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description: 'Saturday mornings for something that builds steadiness in Adam (his individual commitment, not shared)',
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
      proposal({
        description:
          'Weekly 30-minute structured conversation (Sunday evening or set time), one thing each, repeat back before responding, with ground rules: not a decision conversation',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are elaborations on the same two ideas.',
        compatibilityProposedStrategies: [
          'feel less scared',
          'ask to slow down without disappearing',
          'say I am scared and ask for five minutes instead of disappearing',
          'brace before we even start',
          'Saturday mornings - walk without phone, write down feelings before coming home, practice noticing himself without needing Eve to settle him',
          'Once a month do something unfamiliar on purpose to prove change is not always danger',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(0);
  });

  it('classifies Adam verdict-pause practice as individual and deduplicates variants', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is mine to work on.',
        compatibilityProposedStrategies: [
          "Adam's individual practice: noticing when he's treating Eve's wanting as a verdict and pausing before shutting down",
          "Individual commitment: Notice when treating Eve's wanting as a verdict and pause before shutting down",
          "Notice when treating Eve's wanting as a verdict and pause before shutting down",
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledTimes(1);
    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description:
          "Adam's individual practice: noticing when he's treating Eve's wanting as a verdict and pausing before shutting down",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
        createdByUserId: userId,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
    expect(result.skippedOperationCount).toBe(2);
  });

  it('skips Stage 4 refinement fragments folded into the weekly conversation proposal', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are not separate proposals.',
        compatibilityProposedStrategies: [
          'want it to be predictable enough that I do not spend the whole week wondering when the hard conversation is coming',
          'want it to be predictable but contained, so it does not turn into the whole night or some referendum on us',
          'start by each saying the thing and what we want understood about it, before either of us responds',
          'keep the Sunday conversation, and I would also commit to doing my own work on that steadiness',
          'choose for myself, and two things we can try together without pretending they solve everything',
          'choose myself and whether we can try something together without both of us panicking',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('skips Stage 4 replay fragments from confirmation language', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are not separate proposals.',
        compatibilityProposedStrategies: [
          'know whether it is opening something, or whether I am just carrying another plan by myself',
          'bring forward',
          'edit it down before it even starts',
          'not promising it fixes everything',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('classifies monthly experiment with partner engagement as shared and deduplicates variants', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "Try one small new thing each month that Eve chooses, with Adam naming when he's scared instead of shutting down",
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'This is the shared experiment.',
        compatibilityProposedStrategies: [
          "Monthly experiment - Eve chooses a category (travel, new place, unplanned day), then they build the details together. Adam stays engaged without treating her wanting as evidence their life is broken. Three-month check-in to assess whether it's opening something or Eve is carrying it alone",
          "Choose one small new thing each month that Eve initiates, and Adam agrees to stay engaged with it before deciding it is too much",
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: expect.objectContaining({
        description:
          "Monthly experiment - Eve chooses a category (travel, new place, unplanned day), then they build the details together. Adam stays engaged without treating her wanting as evidence their life is broken. Three-month check-in to assess whether it's opening something or Eve is carrying it alone",
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
    expect(result.skippedOperationCount).toBe(1);
  });

  it('does not recapture first-person monthly experiment variants as individual commitments', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "One small new thing each month that Eve chooses, kept small enough that Adam doesn't retreat into over-planning",
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage:
          "I could try one small new thing each month that she chooses, as long as it stays small enough that I don't start hiding inside the planning.",
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(prisma.strategyProposal.update).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
    expect(result.skippedOperationCount).toBe(0);
  });

  it('skips live Stage 4 monthly follow-through and outcome fragments', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those are not separate proposals.',
        compatibilityProposedStrategies: [
          'choose it and see what it feels like to follow through',
          'Adam responds to the news with gladness instead of interpreting it as rejection or failure',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('classifies live individual steadiness wording as an individual commitment', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That is my own practice.',
        compatibilityProposedStrategies: [
          "Saturday mornings reserved for individual steadiness practice (user's own commitment)",
        ],
      })
    );

    expect(prisma.strategyProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Saturday mornings reserved for individual steadiness practice (user's own commitment)",
        kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
      }),
    });
    expect(result.appliedOperationCount).toBe(1);
  });

  it('skips live weekly-conversation fragment phrasing', async () => {
    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'That fragment should not be captured.',
        compatibilityProposedStrategies: ['actually imagine is a weekly conversation with rules before we start'],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount).toBe(0);
  });

  it('deduplicates pause-and-return variants as one shared proposal', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          'Pause-and-return: When Adam is scared, he can name it and take ten minutes, then comes back with a real question',
        kind: Stage4ProposalKind.SHARED_PROPOSAL,
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'This is the pause proposal.',
        compatibilityProposedStrategies: [
          'When Adam feels scared, he can say "I am scared and I need ten minutes," then comes back and asks one real question instead of the conversation ending',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount + result.skippedOperationCount).toBe(1);
  });

  it('deduplicates Adam/Eve weekly check-in and walk variants', async () => {
    (prisma.strategyProposal.findMany as jest.Mock).mockResolvedValue([
      proposal({
        description:
          "Weekly 30-minute conversation on Sunday evening at 7:30, where each person brings one thing they've been carrying and Adam practices staying present without needing an answer yet",
      }),
      proposal({
        id: 'proposal-2',
        description: 'Saturday walk, 45 minutes outside, no destination or relationship agenda',
      }),
    ]);

    const result = await captureStage4Turn(
      captureInput({
        userMessage: 'Those feel concrete.',
        compatibilityProposedStrategies: [
          'Sunday evening, 30 minutes — one thing each person is carrying, agreement upfront that nothing is being decided, just heard',
          'A weekly conversation where the goal is just to understand one thing, not decide the future',
          'One real conversation a week where we name one want or fear without deciding the whole marriage that night',
          'A walk together with no agenda, so everything is not a referendum',
          'Saturday morning or late afternoon walk, 45 minutes, outside with no destination and no relationship agenda',
        ],
      })
    );

    expect(prisma.strategyProposal.create).not.toHaveBeenCalled();
    expect(result.appliedOperationCount + result.skippedOperationCount).toBe(5);
  });

  it.each([
    'That feels complete for now. I do not want to add more just to make this feel more hopeful than it is.',
    'This feels like the right place to close. I do not want to ask what he might try.',
  ])('captures bounded no-shared closure language: %s', async (userMessage) => {
    const result = await captureStage4Turn(captureInput({ userMessage }));

    expect(result.closureSignal).toEqual(
      expect.objectContaining({
        readyToClose: true,
        kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
      })
    );
  });

  it('does not treat complete-enough-to-start language as a closure signal', async () => {
    const result = await captureStage4Turn(captureInput({
      userMessage: 'That feels complete enough to start. I am nervous, but this list feels small enough that I could actually try it.',
    }));

    expect(result.closureSignal).toBeUndefined();
  });
});
