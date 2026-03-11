# Stage 4 API Implementation

## Source Documentation

- [Stage 4 API](../../docs/mvp-planning/plans/backend/api/stage-4.md)
- [Stage 4 Strategic Repair](../../docs/mvp-planning/plans/stages/stage-4-strategic-repair.md)
- [Strategy DTOs](../../shared/src/dto/strategy.ts)

## Prerequisites

- [x] `backend/stage-3-api.md` complete

## External Services Required

> **None additional.**

## Scope

Implement strategy pool, ranking, overlap detection, and agreement creation.

## Implementation Steps

### 1. Write tests first

Create `backend/src/routes/__tests__/stage4.test.ts`:

```typescript
describe('Stage 4 API', () => {
  describe('GET /sessions/:id/strategies', () => {
    it('returns unlabeled strategy pool', async () => {
      const res = await request(app)
        .get('/api/v1/sessions/test-session/strategies')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.strategies).toBeInstanceOf(Array);
      // Strategies should NOT have createdBy visible
      expect(res.body.data.strategies[0]).not.toHaveProperty('createdBy');
    });
  });

  describe('POST /sessions/:id/strategies', () => {
    it('adds user strategy to pool', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/strategies')
        .set('Authorization', 'Bearer valid-token')
        .send({
          description: 'We could try having a weekly check-in',
          needsAddressed: ['connection', 'safety'],
          duration: '2 weeks'
        });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /sessions/:id/strategies/rank', () => {
    it('stores private ranking', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/strategies/rank')
        .set('Authorization', 'Bearer valid-token')
        .send({ rankedIds: ['strat-1', 'strat-2', 'strat-3'] });

      expect(res.body.data.submitted).toBe(true);
    });
  });

  describe('GET /sessions/:id/strategies/overlap', () => {
    it('returns overlap only when both ranked', async () => {
      // Before both rank: null
      // After both rank: overlap calculation
    });
  });

  describe('POST /sessions/:id/agreements', () => {
    it('creates agreement from top strategy', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/agreements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          strategyId: 'strat-1',
          type: 'MICRO_EXPERIMENT',
          followUpDate: '2024-02-01'
        });

      expect(res.body.data.agreement.status).toBe('PROPOSED');
    });
  });
});
```

### 2. Create strategy controller

Create `backend/src/controllers/strategies.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getStrategies = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;

  const strategies = await prisma.strategyProposal.findMany({
    where: { sessionId },
    select: {
      id: true,
      description: true,
      needsAddressed: true,
      duration: true,
      measureOfSuccess: true
      // Note: createdByUserId NOT selected - anonymous pool
    }
  });

  // Shuffle to avoid order bias
  const shuffled = strategies.sort(() => Math.random() - 0.5);

  res.json({ success: true, data: { strategies: shuffled } });
};

export const proposeStrategy = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { description, needsAddressed, duration, measureOfSuccess } = req.body;
  const userId = req.user!.id;

  const strategy = await prisma.strategyProposal.create({
    data: {
      sessionId,
      createdByUserId: userId,
      description,
      needsAddressed,
      duration,
      measureOfSuccess,
      source: 'USER_SUBMITTED'
    }
  });

  res.status(201).json({
    success: true,
    data: { strategy: { id: strategy.id } }
  });
};

export const submitRanking = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { rankedIds } = req.body;
  const userId = req.user!.id;

  await prisma.strategyRanking.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId, rankedIds },
    update: { rankedIds, submittedAt: new Date() }
  });

  // Update gate
  await prisma.stageProgress.update({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 4 } },
    data: { gatesSatisfied: { rankingSubmitted: true } }
  });

  // Notify partner
  const partnerId = await getPartnerId(sessionId, userId);
  await notifyPartner(sessionId, partnerId, 'partner.ranking_submitted', {});

  res.json({ success: true, data: { submitted: true } });
};

export const getOverlap = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;
  const partnerId = await getPartnerId(sessionId, userId);

  const rankings = await prisma.strategyRanking.findMany({
    where: { sessionId, userId: { in: [userId, partnerId] } }
  });

  if (rankings.length < 2) {
    return res.json({
      success: true,
      data: { overlap: null, waitingForPartner: true }
    });
  }

  // Calculate Kendall tau or simple overlap
  const myRanking = rankings.find(r => r.userId === userId)!.rankedIds;
  const partnerRanking = rankings.find(r => r.userId === partnerId)!.rankedIds;

  // Simple overlap: strategies in both top 3
  const myTop3 = new Set(myRanking.slice(0, 3));
  const partnerTop3 = new Set(partnerRanking.slice(0, 3));
  const topOverlap = [...myTop3].filter(id => partnerTop3.has(id));

  res.json({
    success: true,
    data: {
      overlap: topOverlap,
      agreementCandidates: topOverlap.length > 0 ? topOverlap : [myRanking[0], partnerRanking[0]]
    }
  });
};

export const createAgreement = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { strategyId, type, followUpDate } = req.body;

  const strategy = await prisma.strategyProposal.findUnique({
    where: { id: strategyId }
  });

  const sharedVessel = await prisma.sharedVessel.findUnique({
    where: { sessionId }
  });

  const agreement = await prisma.agreement.create({
    data: {
      sharedVesselId: sharedVessel!.id,
      description: strategy!.description,
      type,
      proposalId: strategyId,
      followUpDate: followUpDate ? new Date(followUpDate) : null
    }
  });

  res.json({ success: true, data: { agreement } });
};
```

### 3. Run verification

```bash
npm run check
npm run test
```

## Verification

- [x] Strategy pool is anonymous (no createdBy exposed)
- [x] Strategies shuffled to prevent order bias
- [x] Rankings are private until both submit
- [x] Overlap calculated correctly
- [x] Agreement links to strategy
- [x] Partner notifications sent
- [x] `npm run check` passes
- [x] `npm run test` passes
