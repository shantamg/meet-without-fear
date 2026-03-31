/**
 * Circuit Breaker: Check and increment refinement attempts
 *
 * Prevents infinite refinement loops by limiting attempts to 3 per direction.
 */

import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

// ============================================================================
// Circuit Breaker: Check and increment refinement attempts
// ============================================================================

/**
 * Check the current attempt count for a direction (read-only).
 * Used by runReconcilerForDirection to enforce the circuit breaker limit.
 */
export async function checkAttempts(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<{ shouldSkipReconciler: boolean; attempts: number }> {
  const direction = `${guesserId}->${subjectId}`;

  const counter = await prisma.refinementAttemptCounter.findUnique({
    where: { sessionId_direction: { sessionId, direction } },
  });

  const attempts = counter?.attempts ?? 0;
  const shouldSkipReconciler = attempts > 3;

  logger.debug('Circuit breaker check', { direction, attempts, shouldSkipReconciler });

  return { shouldSkipReconciler, attempts };
}

/**
 * Increment the attempt counter for a direction (write-only).
 * Called ONLY from resubmitEmpathy code paths, NOT from initial reconciler runs.
 */
export async function incrementAttempts(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<void> {
  const direction = `${guesserId}->${subjectId}`;

  await prisma.refinementAttemptCounter.upsert({
    where: { sessionId_direction: { sessionId, direction } },
    create: { sessionId, direction, attempts: 1 },
    update: { attempts: { increment: 1 } },
  });

  logger.debug('Circuit breaker incremented', { direction });
}

// ============================================================================
// Helper: Check if context has already been shared for a direction
// ============================================================================

/**
 * Check if SHARED_CONTEXT has already been sent from subject to guesser.
 *
 * This prevents the reconciler loop where:
 * 1. Reconciler finds gaps -> sets status to AWAITING_SHARING
 * 2. User shares context -> SHARED_CONTEXT message created
 * 3. User resubmits empathy -> ReconcilerResult deleted (cascades to ReconcilerShareOffer)
 * 4. Reconciler runs again -> finds same gaps -> sets AWAITING_SHARING again
 * 5. Loop repeats indefinitely
 *
 * By checking for existing SHARED_CONTEXT messages, we can skip the sharing step
 * if context has already been shared for this direction.
 *
 * @param sessionId - The session ID
 * @param guesserId - The guesser (person whose empathy has gaps)
 * @param subjectId - The subject (person who should share context)
 * @returns true if context has already been shared for this direction
 */
export async function hasContextAlreadyBeenShared(
  sessionId: string,
  guesserId: string,
  subjectId: string
): Promise<boolean> {
  // SHARED_CONTEXT messages have:
  // - senderId = subject (person who shared)
  // - forUserId = guesser (person who receives the context)
  const existingSharedContext = await prisma.message.findFirst({
    where: {
      sessionId,
      role: 'SHARED_CONTEXT',
      senderId: subjectId,
      forUserId: guesserId,
    },
  });

  if (existingSharedContext) {
    logger.info('Context already shared', { subjectId, guesserId, sharedAt: existingSharedContext.timestamp.toISOString() });
    return true;
  }

  return false;
}
