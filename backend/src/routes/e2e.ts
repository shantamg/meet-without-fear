/**
 * E2E Testing Routes
 *
 * Helper endpoints for E2E testing. Only available when E2E_AUTH_BYPASS is enabled.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { loadFixture } from '../lib/e2e-fixtures';
import { StateFactory, TargetStage } from '../testing/state-factory';
import { runReconcilerForDirection } from '../services/reconciler';

const router = Router();

/**
 * Clean up all E2E test data.
 * Deletes users with emails matching *@e2e.test pattern.
 * Cascades to related data through Prisma's referential actions.
 */
export async function cleanupE2EUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only allow when E2E mode is enabled
  if (process.env.E2E_AUTH_BYPASS !== 'true') {
    res.status(403).json({
      success: false,
      error: 'E2E cleanup only available when E2E_AUTH_BYPASS is enabled',
    });
    return;
  }

  try {
    const result = await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: '@e2e.test',
        },
      },
    });

    res.status(200).json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    next(error);
  }
}

router.post('/cleanup', cleanupE2EUsers);

/**
 * Seed a test user for E2E testing.
 * Creates a user in the database with the provided email/name or from a fixture.
 *
 * Body options:
 * - { email: string, name?: string } - Create user with explicit email
 * - { fixtureId: string } - Load user from fixture seed
 *
 * Returns 201 with { id, email, name } on success.
 * Returns 400 if email doesn't end in @e2e.test
 * Returns 403 if E2E_AUTH_BYPASS is not true
 */
export async function seedE2EUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only allow when E2E mode is enabled
  if (process.env.E2E_AUTH_BYPASS !== 'true') {
    res.status(403).json({
      success: false,
      error: 'E2E seed only available when E2E_AUTH_BYPASS is enabled',
    });
    return;
  }

  try {
    const { email, name, fixtureId } = req.body;

    let userEmail: string;
    let userName: string;

    if (fixtureId) {
      // Load user from fixture
      const fixture = loadFixture(fixtureId);
      if (!fixture.seed?.users || fixture.seed.users.length === 0) {
        res.status(400).json({
          success: false,
          error: `Fixture ${fixtureId} has no seed users`,
        });
        return;
      }
      const fixtureUser = fixture.seed.users[0];
      userEmail = fixtureUser.email;
      userName = fixtureUser.name;
    } else if (email) {
      userEmail = email;
      userName = name || 'E2E Test User';
    } else {
      res.status(400).json({
        success: false,
        error: 'Either email or fixtureId is required',
      });
      return;
    }

    // Validate email domain
    if (!userEmail.endsWith('@e2e.test')) {
      res.status(400).json({
        success: false,
        error: 'Email must end with @e2e.test',
      });
      return;
    }

    // Create user with e2e_ prefixed clerkId
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: { name: userName },
      create: {
        email: userEmail,
        name: userName,
        clerkId: `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  } catch (error) {
    next(error);
  }
}

router.post('/seed', seedE2EUser);

/**
 * Seed a session at a specific stage for E2E testing.
 * Creates users, relationship, session, invitation, and stage-specific data.
 *
 * Body:
 * {
 *   userA: { email: string, name: string },
 *   userB?: { email: string, name: string },
 *   targetStage: 'CREATED' | 'EMPATHY_SHARED_A'
 * }
 *
 * Returns 201 with session/user/invitation details and page URLs.
 * Returns 400 if validation fails.
 * Returns 403 if E2E_AUTH_BYPASS is not true.
 */
export async function seedE2ESession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only allow when E2E mode is enabled
  if (process.env.E2E_AUTH_BYPASS !== 'true') {
    res.status(403).json({
      success: false,
      error: 'E2E seed-session only available when E2E_AUTH_BYPASS is enabled',
    });
    return;
  }

  try {
    const { userA, userB, targetStage } = req.body;

    // Validate required fields
    if (!userA || !userA.email || !userA.name) {
      res.status(400).json({
        success: false,
        error: 'userA with email and name is required',
      });
      return;
    }

    // Validate email domains
    if (!userA.email.endsWith('@e2e.test')) {
      res.status(400).json({
        success: false,
        error: 'userA.email must end with @e2e.test',
      });
      return;
    }

    if (userB && userB.email && !userB.email.endsWith('@e2e.test')) {
      res.status(400).json({
        success: false,
        error: 'userB.email must end with @e2e.test',
      });
      return;
    }

    // Validate target stage
    const validStages = Object.values(TargetStage);
    if (!targetStage || !validStages.includes(targetStage)) {
      res.status(400).json({
        success: false,
        error: `targetStage must be one of: ${validStages.join(', ')}`,
      });
      return;
    }

    // Get base URL from environment or use default
    const baseUrl = process.env.E2E_APP_BASE_URL || 'http://localhost:8082';

    // Create the session at the specified stage
    const factory = new StateFactory(baseUrl);
    const result = await factory.createSessionAtStage({
      userA: { email: userA.email, name: userA.name },
      userB: userB ? { email: userB.email, name: userB.name } : undefined,
      targetStage: targetStage as TargetStage,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[seedE2ESession] Error:', error);
    next(error);
  }
}

router.post('/seed-session', seedE2ESession);

/**
 * Trigger the reconciler for a specific direction in a session.
 * This allows E2E tests seeded at FEEL_HEARD_B to run the reconciler
 * via API call instead of navigating through the UI.
 *
 * Body:
 * {
 *   sessionId: string,
 *   guesserId: string,
 *   subjectId: string
 * }
 *
 * Returns 200 with reconciler result and share offer details.
 * Returns 400 if validation fails.
 * Returns 403 if E2E_AUTH_BYPASS is not true.
 */
export async function triggerE2EReconciler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only allow when E2E mode is enabled
  if (process.env.E2E_AUTH_BYPASS !== 'true') {
    res.status(403).json({
      success: false,
      error: 'E2E trigger-reconciler only available when E2E_AUTH_BYPASS is enabled',
    });
    return;
  }

  try {
    const { sessionId, guesserId, subjectId } = req.body;

    // Validate required fields
    if (!sessionId || !guesserId || !subjectId) {
      res.status(400).json({
        success: false,
        error: 'sessionId, guesserId, and subjectId are required',
      });
      return;
    }

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      res.status(400).json({
        success: false,
        error: `Session ${sessionId} not found`,
      });
      return;
    }

    // Run the reconciler for the specified direction
    const result = await runReconcilerForDirection(sessionId, guesserId, subjectId);

    res.status(200).json({
      success: true,
      data: {
        reconcilerResult: result.result,
        empathyStatus: result.empathyStatus,
        shareOffer: result.shareOffer,
      },
    });
  } catch (error) {
    console.error('[triggerE2EReconciler] Error:', error);
    next(error);
  }
}

router.post('/trigger-reconciler', triggerE2EReconciler);

export default router;
