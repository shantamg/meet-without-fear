import { NeedCategory } from '@meet-without-fear/shared';
import { prisma } from '../../lib/prisma';
import { getModelCompletion } from '../../lib/bedrock';
import { validateNeedIsUniversal } from '../needs';
import { applyNeedEdits, NeedEditForbiddenError } from '../needs-edit-applier.service';
import { interpretNeedEditRequest } from '../needs-edit-interpreter.service';

jest.mock('../../lib/prisma');
jest.mock('../../lib/bedrock', () => ({
  getModelCompletion: jest.fn(),
}));

const sessionId = 'session-1';
const userId = 'user-1';
const vesselId = 'vessel-1';

function need(overrides: Record<string, unknown> = {}) {
  return {
    id: 'need-1',
    vesselId,
    need: 'I need reliability around shared chores.',
    category: NeedCategory.FAIRNESS,
    evidence: [],
    aiConfidence: 0.85,
    confirmed: false,
    createdAt: new Date('2026-05-19T12:00:00.000Z'),
    ...overrides,
  };
}

describe('Stage 3 need edit services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(prisma));
    (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue({
      sessionId,
      userId,
      stage: 3,
      gatesSatisfied: {},
    });
    (prisma.userVessel.findUnique as jest.Mock).mockResolvedValue({ id: vesselId });
    (prisma.identifiedNeed.findMany as jest.Mock).mockResolvedValue([need()]);
  });

  it('flags obvious strategy-shaped or partner-directed needs', () => {
    expect(validateNeedIsUniversal('I need him to stop leaving dishes everywhere.')).toEqual(
      expect.objectContaining({ ok: false })
    );
    expect(validateNeedIsUniversal('I need time to decompress after work.')).toEqual({
      ok: true,
    });
    expect(validateNeedIsUniversal('I need more care and reliability around our shared space.')).toEqual({
      ok: true,
    });
  });

  it('interprets a model edit response as a preview without mutating needs', async () => {
    (getModelCompletion as jest.Mock).mockResolvedValue(
      JSON.stringify({
        summary: 'I made this less about what they must do.',
        operations: [
          {
            type: 'updateNeedText',
            needId: 'need-1',
            newText: 'I need more care and reliability around our shared space.',
            newCategory: NeedCategory.FAIRNESS,
          },
        ],
      })
    );

    const result = await interpretNeedEditRequest(sessionId, userId, {
      request: 'Make the first one less about him.',
    });

    expect(result.plan?.summary).toContain('less about');
    expect(result.plan?.affectedNeeds[0]).toEqual(
      expect.objectContaining({
        needId: 'need-1',
        before: expect.objectContaining({ text: 'I need reliability around shared chores.' }),
        after: expect.objectContaining({
          text: 'I need more care and reliability around our shared space.',
        }),
      })
    );
    expect(prisma.identifiedNeed.update).not.toHaveBeenCalled();
    expect(prisma.identifiedNeed.create).not.toHaveBeenCalled();
    expect(prisma.identifiedNeed.delete).not.toHaveBeenCalled();
  });

  it('applies update, add, and remove operations transactionally', async () => {
    (prisma.identifiedNeed.findMany as jest.Mock)
      .mockResolvedValueOnce([need(), need({ id: 'need-2', need: 'I need calmer mornings.' })])
      .mockResolvedValueOnce([
        need({
          need: 'I need more care and reliability around our shared space.',
          confirmed: true,
        }),
      ]);

    const result = await applyNeedEdits(sessionId, userId, [
      {
        type: 'updateNeedText',
        needId: 'need-1',
        newText: 'I need more care and reliability around our shared space.',
        newCategory: NeedCategory.FAIRNESS,
      },
      {
        type: 'addNeed',
        text: 'I need a calmer, more predictable start to the day.',
        category: NeedCategory.SAFETY,
      },
      { type: 'removeNeed', needId: 'need-2' },
    ]);

    expect(prisma.identifiedNeed.update).toHaveBeenCalledWith({
      where: { id: 'need-1' },
      data: expect.objectContaining({
        need: 'I need more care and reliability around our shared space.',
        confirmed: true,
      }),
    });
    expect(prisma.identifiedNeed.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vesselId,
        need: 'I need a calmer, more predictable start to the day.',
        category: NeedCategory.SAFETY,
        confirmed: true,
      }),
    });
    expect(prisma.identifiedNeed.delete).toHaveBeenCalledWith({ where: { id: 'need-2' } });
    expect(result.applied).toHaveLength(3);
    expect(result.needs[0]).toEqual(
      expect.objectContaining({
        need: 'I need more care and reliability around our shared space.',
      })
    );
  });

  it('refuses to apply edits after needs are shared', async () => {
    (prisma.stageProgress.findUnique as jest.Mock).mockResolvedValue({
      sessionId,
      userId,
      stage: 3,
      gatesSatisfied: { needsShared: true },
    });

    await expect(
      applyNeedEdits(sessionId, userId, [
        {
          type: 'updateNeedText',
          needId: 'need-1',
          newText: 'I need calmer shared space.',
        },
      ])
    ).rejects.toBeInstanceOf(NeedEditForbiddenError);

    expect(prisma.identifiedNeed.update).not.toHaveBeenCalled();
  });
});
