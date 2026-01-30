/**
 * E2E Testing Routes
 *
 * Helper endpoints for E2E testing. Only available when E2E_AUTH_BYPASS is enabled.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

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

export default router;
