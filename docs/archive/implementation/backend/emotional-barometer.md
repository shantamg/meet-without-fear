# Emotional Barometer API Implementation

## Source Documentation

- [Emotional Barometer API](../../docs/mvp-planning/plans/backend/api/emotional-barometer.md)
- [Emotional Barometer Mechanism](../../docs/mvp-planning/plans/mechanisms/emotional-barometer.md)

## Prerequisites

- [ ] `backend/database.md` complete
- [ ] `backend/auth.md` complete

## External Services Required

> **None additional.**

## Scope

Implement emotion tracking and regulation exercise logging.

## Implementation Steps

### 1. Write tests first

Create `backend/src/routes/__tests__/emotions.test.ts`:

```typescript
describe('Emotional Barometer API', () => {
  describe('POST /sessions/:id/emotions', () => {
    it('records emotional reading', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/emotions')
        .set('Authorization', 'Bearer valid-token')
        .send({ intensity: 7, context: 'Feeling overwhelmed' });

      expect(res.status).toBe(200);
      expect(res.body.data.reading.intensity).toBe(7);
    });

    it('validates intensity 1-10', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/emotions')
        .set('Authorization', 'Bearer valid-token')
        .send({ intensity: 15 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /sessions/:id/emotions', () => {
    it('returns emotion history for user', async () => {
      const res = await request(app)
        .get('/api/v1/sessions/test-session/emotions')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.readings).toBeInstanceOf(Array);
    });

    it('does not expose partner emotions', async () => {
      // Ensure privacy - only user's own readings
    });
  });

  describe('POST /sessions/:id/exercises/complete', () => {
    it('logs exercise completion with before/after', async () => {
      const res = await request(app)
        .post('/api/v1/sessions/test-session/exercises/complete')
        .set('Authorization', 'Bearer valid-token')
        .send({
          type: 'BREATHING_EXERCISE',
          intensityBefore: 8,
          intensityAfter: 5
        });

      expect(res.body.data.logged).toBe(true);
    });
  });
});
```

### 2. Create emotions controller

Create `backend/src/controllers/emotions.ts`:

```typescript
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const recordEmotion = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { intensity, context } = req.body;
  const userId = req.user!.id;

  // Get user's vessel
  const vessel = await prisma.userVessel.findUnique({
    where: { userId_sessionId: { userId, sessionId } }
  });

  if (!vessel) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Session not found' }
    });
  }

  // Get current stage
  const progress = await prisma.stageProgress.findFirst({
    where: { sessionId, userId, status: 'IN_PROGRESS' },
    orderBy: { stage: 'desc' }
  });

  const reading = await prisma.emotionalReading.create({
    data: {
      vesselId: vessel.id,
      intensity,
      context,
      stage: progress?.stage ?? 0
    }
  });

  // Check if intervention needed (intensity >= 8)
  const needsIntervention = intensity >= 8;

  res.json({
    success: true,
    data: {
      reading: {
        id: reading.id,
        intensity: reading.intensity,
        timestamp: reading.timestamp
      },
      suggestExercise: needsIntervention
    }
  });
};

export const getEmotions = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const userId = req.user!.id;

  const vessel = await prisma.userVessel.findUnique({
    where: { userId_sessionId: { userId, sessionId } }
  });

  const readings = await prisma.emotionalReading.findMany({
    where: { vesselId: vessel?.id },
    orderBy: { timestamp: 'desc' },
    take: 50
  });

  res.json({
    success: true,
    data: {
      readings: readings.map(r => ({
        id: r.id,
        intensity: r.intensity,
        context: r.context,
        stage: r.stage,
        timestamp: r.timestamp
      }))
    }
  });
};

export const completeExercise = async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { type, intensityBefore, intensityAfter } = req.body;
  const userId = req.user!.id;

  await prisma.emotionalExerciseCompletion.create({
    data: {
      sessionId,
      userId,
      type,
      intensityBefore,
      intensityAfter
    }
  });

  res.json({ success: true, data: { logged: true } });
};
```

### 3. Create routes

```typescript
router.post('/sessions/:id/emotions', requireAuth, recordEmotion);
router.get('/sessions/:id/emotions', requireAuth, getEmotions);
router.post('/sessions/:id/exercises/complete', requireAuth, completeExercise);
```

### 4. Run verification

```bash
npm run check
npm run test
```

## Verification

- [ ] Emotional readings saved to user's vessel
- [ ] Intensity validated 1-10
- [ ] High intensity (>=8) suggests exercise
- [ ] Exercise completions logged with delta
- [ ] Partner's emotions not exposed
- [ ] `npm run check` passes
- [ ] `npm run test` passes
