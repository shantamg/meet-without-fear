import { PrismaClient } from '@prisma/client';
import { checkAndIncrementAttempts } from '../services/reconciler';

/**
 * Circuit Breaker Tests
 *
 * Tests the refinement attempt counter that prevents infinite refinement loops.
 * The circuit breaker limits empathy refinement attempts to 3 per direction.
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

  describe('checkAndIncrementAttempts', () => {
    it('first attempt returns shouldSkip=false with attempts=1', async () => {
      const result = await checkAndIncrementAttempts(
        testSessionId,
        userAId,
        userBId
      );

      expect(result.shouldSkipReconciler).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('third attempt returns shouldSkip=false with attempts=3', async () => {
      // Make 3 attempts
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      const result = await checkAndIncrementAttempts(testSessionId, userAId, userBId);

      expect(result.shouldSkipReconciler).toBe(false);
      expect(result.attempts).toBe(3);
    });

    it('fourth attempt returns shouldSkip=true', async () => {
      // Make 4 attempts
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      const result = await checkAndIncrementAttempts(testSessionId, userAId, userBId);

      expect(result.shouldSkipReconciler).toBe(true);
      expect(result.attempts).toBe(4);
    });

    it('tracks directions independently', async () => {
      // Make 3 attempts for direction A->B
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      await checkAndIncrementAttempts(testSessionId, userAId, userBId);

      // First attempt for direction B->A should be independent
      const result = await checkAndIncrementAttempts(testSessionId, userBId, userAId);

      expect(result.shouldSkipReconciler).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('persists across function calls', async () => {
      // First call
      const result1 = await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      expect(result1.attempts).toBe(1);

      // Second call should have attempts=2 (not 1)
      const result2 = await checkAndIncrementAttempts(testSessionId, userAId, userBId);
      expect(result2.attempts).toBe(2);
    });
  });
});
