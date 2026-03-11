# Stage 2 API Implementation

## Source Documentation

- [Stage 2 API](../../docs/mvp-planning/plans/backend/api/stage-2.md)
- [Stage 2 Perspective Stretch](../../docs/mvp-planning/plans/stages/stage-2-perspective-stretch.md)
- [Empathy DTOs](../../shared/src/dto/empathy.ts)

## Prerequisites

- [ ] `backend/stage-1-api.md` complete

## External Services Required

> **None additional.** Uses existing Anthropic API.

## Scope

Implement empathy draft, consent, sharing, and validation endpoints.

## Implementation Steps

### 1. Write tests first

Create `backend/src/routes/__tests__/stage2.test.ts`:

```typescript
describe('Stage 2 API', () => {
  describe('POST /sessions/:id/empathy/draft', () => {
    it('saves empathy draft', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/empathy/draft')
        .set('Authorization', 'Bearer valid-token')
        .send({
          content: 'I think you felt frustrated because...',
          readyToShare: false
        });

      expect(res.status).toBe(200);
      expect(res.body.data.draft.version).toBe(1);
    });

    it('increments version on update', async () => {
      // Save draft, update, check version = 2
    });
  });

  describe('POST /sessions/:id/empathy/consent', () => {
    it('requires draft to be ready before consent', async () => {
      // Try to consent without readyToShare = true
    });
  });

  describe('GET /sessions/:id/empathy/partner', () => {
    it('returns null if partner has not consented', async () => {
      const res = await request(app)
        .get('/api/v1/sessions/test-session/empathy/partner')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.partnerEmpathy).toBeNull();
    });
  });

  describe('POST /sessions/:id/empathy/validate', () => {
    it('records validation and notifies partner', async () => {
      // Validate partner's empathy, check notification sent
    });
  });
});
```

### 2. Create empathy controller

Create `backend/src/controllers/empathy.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { notifyPartner } from '../services/realtime';

export const saveDraft = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { content, readyToShare } = req.body;
  const userId = req.user!.id;

  const draft = await prisma.empathyDraft.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: {
      sessionId,
      userId,
      content,
      readyToShare: readyToShare ?? false,
      version: 1
    },
    update: {
      content,
      readyToShare: readyToShare ?? false,
      version: { increment: 1 }
    }
  });

  res.json({
    success: true,
    data: { draft: { id: draft.id, version: draft.version, readyToShare: draft.readyToShare } }
  });
};

export const consentToShare = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  // Check draft is ready
  const draft = await prisma.empathyDraft.findUnique({
    where: { sessionId_userId: { sessionId, userId } }
  });

  if (!draft?.readyToShare) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Draft must be marked ready to share' }
    });
  }

  // Create consent record
  const consent = await prisma.consentRecord.create({
    data: {
      userId,
      sessionId,
      targetType: 'EMPATHY_DRAFT',
      targetId: draft.id,
      requestedByUserId: userId,
      decision: 'GRANTED',
      decidedAt: new Date()
    }
  });

  // Create empathy attempt
  await prisma.empathyAttempt.create({
    data: {
      draftId: draft.id,
      sessionId,
      sourceUserId: userId,
      content: draft.content,
      consentRecordId: consent.id
    }
  });

  // Notify partner
  const partnerId = await getPartnerId(sessionId, userId);
  await notifyPartner(sessionId, partnerId, 'partner.empathy_shared', {});

  res.json({ success: true, data: { shared: true } });
};

export const getPartnerEmpathy = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;
  const partnerId = await getPartnerId(sessionId, userId);

  const attempt = await prisma.empathyAttempt.findFirst({
    where: { sessionId, sourceUserId: partnerId },
    orderBy: { sharedAt: 'desc' }
  });

  res.json({
    success: true,
    data: {
      partnerEmpathy: attempt ? {
        id: attempt.id,
        content: attempt.content,
        sharedAt: attempt.sharedAt
      } : null
    }
  });
};

export const validateEmpathy = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { validated, feedback } = req.body;
  const userId = req.user!.id;
  const partnerId = await getPartnerId(sessionId, userId);

  // Get partner's attempt
  const attempt = await prisma.empathyAttempt.findFirst({
    where: { sessionId, sourceUserId: partnerId },
    orderBy: { sharedAt: 'desc' }
  });

  if (!attempt) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'No partner empathy attempt found' }
    });
  }

  await prisma.empathyValidation.create({
    data: {
      attemptId: attempt.id,
      sessionId,
      userId,
      validated,
      feedback
    }
  });

  // Update stage progress if validated
  if (validated) {
    await prisma.stageProgress.update({
      where: { sessionId_userId_stage: { sessionId, userId, stage: 2 } },
      data: { gatesSatisfied: { empathyValidated: true } }
    });
  }

  res.json({ success: true, data: { validated } });
};
```

### 3. Create routes

```typescript
router.post('/sessions/:id/empathy/draft', requireAuth, saveDraft);
router.get('/sessions/:id/empathy/draft', requireAuth, getDraft);
router.post('/sessions/:id/empathy/consent', requireAuth, consentToShare);
router.get('/sessions/:id/empathy/partner', requireAuth, getPartnerEmpathy);
router.post('/sessions/:id/empathy/validate', requireAuth, validateEmpathy);
```

### 4. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] Draft saves with version tracking
- [ ] Consent requires `readyToShare: true`
- [ ] Partner empathy only visible after consent
- [ ] Validation updates gate status
- [ ] Partner notified on share
- [ ] `npm run check` passes
- [ ] `npm run test` passes
