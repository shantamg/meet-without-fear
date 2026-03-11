# Stage 0 API Implementation

## Source Documentation

- [Stage 0 API](../../docs/mvp-planning/plans/backend/api/stage-0.md)
- [Stage 0 Onboarding](../../docs/mvp-planning/plans/stages/stage-0-onboarding.md)

## Prerequisites

- [ ] `backend/auth.md` complete
- [ ] `backend/realtime.md` complete

## External Services Required

> **None additional.** Uses existing Supabase and Ably.

## Scope

Implement Curiosity Compact signing endpoints.

## Implementation Steps

### 1. Write route tests first

Create `backend/src/routes/__tests__/stage0.test.ts`:

```typescript
import request from 'supertest';
import { app } from '../../app';

describe('Stage 0 API', () => {
  describe('POST /sessions/:id/compact/sign', () => {
    it('signs compact for authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/compact/sign')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.signed).toBe(true);
    });

    it('returns 409 if already signed', async () => {
      // Sign first, then try again
    });
  });

  describe('GET /sessions/:id/compact/status', () => {
    it('returns signing status for both parties', async () => {
      const res = await request(app)
        .get('/api/v1/sessions/test-session/compact/status')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data).toHaveProperty('mySigned');
      expect(res.body.data).toHaveProperty('partnerSigned');
    });

    it('hides partnerSignedAt until user signs', async () => {
      // Verify privacy constraint
    });
  });
});
```

### 2. Create stage 0 controller

Create `backend/src/controllers/stage0.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { notifyPartner } from '../services/realtime';

export const signCompact = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  // Check if already signed
  const existing = await prisma.stageProgress.findUnique({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 0 } }
  });

  if (existing?.gatesSatisfied?.compactSigned) {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'Already signed' }
    });
  }

  // Update stage progress
  await prisma.stageProgress.upsert({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 0 } },
    create: {
      sessionId,
      userId,
      stage: 0,
      status: 'IN_PROGRESS',
      gatesSatisfied: { compactSigned: true, signedAt: new Date() }
    },
    update: {
      gatesSatisfied: { compactSigned: true, signedAt: new Date() }
    }
  });

  // Check if partner signed
  const partner = await getPartnerProgress(sessionId, userId);
  const partnerSigned = partner?.gatesSatisfied?.compactSigned ?? false;
  const canAdvance = partnerSigned;

  // Notify partner
  await notifyPartner(sessionId, partner.userId, 'partner.signed_compact', {
    signedAt: new Date().toISOString()
  });

  res.json({
    success: true,
    data: {
      signed: true,
      signedAt: new Date().toISOString(),
      partnerSigned,
      canAdvance
    }
  });
};

export const getCompactStatus = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  const myProgress = await prisma.stageProgress.findUnique({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 0 } }
  });

  const mySigned = myProgress?.gatesSatisfied?.compactSigned ?? false;
  const mySignedAt = myProgress?.gatesSatisfied?.signedAt ?? null;

  // Only show partner status if user has signed
  let partnerSigned = false;
  let partnerSignedAt = null;

  if (mySigned) {
    const partner = await getPartnerProgress(sessionId, userId);
    partnerSigned = partner?.gatesSatisfied?.compactSigned ?? false;
    partnerSignedAt = partner?.gatesSatisfied?.signedAt ?? null;
  }

  res.json({
    success: true,
    data: {
      mySigned,
      mySignedAt,
      partnerSigned,
      partnerSignedAt,
      canAdvance: mySigned && partnerSigned
    }
  });
};
```

### 3. Create routes

Create `backend/src/routes/stage0.ts`:

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { signCompact, getCompactStatus } from '../controllers/stage0';

const router = Router();

router.post('/sessions/:id/compact/sign', requireAuth, signCompact);
router.get('/sessions/:id/compact/status', requireAuth, getCompactStatus);

export default router;
```

### 4. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] `POST /compact/sign` creates stage progress with gate satisfied
- [ ] Duplicate signing returns 409
- [ ] Partner is notified via Ably/push
- [ ] `GET /compact/status` respects privacy (partner time hidden until user signs)
- [ ] `canAdvance` only true when both signed
- [ ] `npm run check` passes
- [ ] `npm run test` passes
