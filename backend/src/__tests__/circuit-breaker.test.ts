import { PrismaClient } from '@prisma/client';
import { checkAttempts, incrementAttempts } from '../services/reconciler';

/**
 * Circuit Breaker Tests
 *
 * Tests the refinement attempt counter that prevents infinite refinement loops.
 * The circuit breaker limits empathy refinement attempts to 3 per direction.
 *
 * checkAttempts is read-only (used by reconciler runs).
 * incrementAttempts is write-only (called only from resubmitEmpathy).
 */
describe('Circuit Breaker', () => {
  let prisma: PrismaClient;
  const testSessionId = 'test-session-circuit-breaker';
  const userAId = 'user-a';
  const userBId = 'user-b';

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await prisma.refinementAttemptCounter.deleteMany({
      where: { sessionId: testSessionId },
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await prisma.refinementAttemptCounter.deleteMany({
      where: { sessionId: testSessionId },
    });
  });

  describe('checkAttempts (read-only)', () => {
    it('returns shouldSkip=false with attempts=0 when no counter exists', async () => {
      const result = await checkAttempts(testSessionId, userAId, userBId);

      expect(result.shouldSkipReconciler).toBe(false);
      expect(result.attempts).toBe(0);
    });

    it('does not create or modify the counter', async () => {
      // Check twice — should not create a counter
      await checkAttempts(testSessionId, userAId, userBId);
      await checkAttempts(testSessionId, userAId, userBId);

      const direction = `${userAId}->${userBId}`;
      const counter = await prisma.refinementAttemptCounter.findUnique({
        where: { sessionId_direction: { sessionId: testSessionId, direction } },
      });

      expect(counter).toBeNull();
    });
  });

  describe('incrementAttempts (write-only)', () => {
    it('creates counter with attempts=1 on first call', async () => {
      await incrementAttempts(testSessionId, userAId, userBId);

      const result = await checkAttempts(testSessionId, userAId, userBId);
      expect(result.attempts).toBe(1);
      expect(result.shouldSkipReconciler).toBe(false);
    });

    it('third increment results in shouldSkip=false', async () => {
      await incrementAttempts(testSessionId, userAId, userBId);
      await incrementAttempts(testSessionId, userAId, userBId);
      await incrementAttempts(testSessionId, userAId, userBId);

      const result = await checkAttempts(testSessionId, userAId, userBId);
      expect(result.shouldSkipReconciler).toBe(false);
      expect(result.attempts).toBe(3);
    });

    it('fourth increment results in shouldSkip=true', async () => {
      await incrementAttempts(testSessionId, userAId, userBId);
      await incrementAttempts(testSessionId, userAId, userBId);
      await incrementAttempts(testSessionId, userAId, userBId);
      await incrementAttempts(testSessionId, userAId, userBId);

      const result = await checkAttempts(testSessionId, userAId, userBId);
      expect(result.shouldSkipReconciler).toBe(true);
      expect(result.attempts).toBe(4);
    });

    it('tracks directions independently', async () => {
      // Increment 3 times for direction A->B
      await incrementAttempts(testSessionId, userAId, userBId);
      await incrementAttempts(testSessionId, userAId, userBId);
      await incrementAttempts(testSessionId, userAId, userBId);

      // Direction B->A should still be at 0
      const result = await checkAttempts(testSessionId, userBId, userAId);
      expect(result.shouldSkipReconciler).toBe(false);
      expect(result.attempts).toBe(0);
    });

    it('persists across function calls', async () => {
      await incrementAttempts(testSessionId, userAId, userBId);
      const result1 = await checkAttempts(testSessionId, userAId, userBId);
      expect(result1.attempts).toBe(1);

      await incrementAttempts(testSessionId, userAId, userBId);
      const result2 = await checkAttempts(testSessionId, userAId, userBId);
      expect(result2.attempts).toBe(2);
    });
  });
});
