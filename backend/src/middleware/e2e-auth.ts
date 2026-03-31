/**
 * E2E Authentication Bypass
 *
 * Extracted from the production auth middleware to ensure E2E bypass logic
 * is never in the production code path. Only imported conditionally when
 * NODE_ENV !== 'production'.
 *
 * When E2E_AUTH_BYPASS=true, accepts x-e2e-user-id and x-e2e-user-email
 * headers to skip Clerk JWT verification.
 */

import { Request } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Attempts E2E auth bypass. Returns true if bypass was applied.
 * Only call this when E2E_AUTH_BYPASS=true AND NODE_ENV !== 'production'.
 */
export async function handleE2EAuthBypass(req: Request): Promise<boolean> {
  const e2eUserId = req.headers['x-e2e-user-id'] as string | undefined;
  const e2eEmail = req.headers['x-e2e-user-email'] as string | undefined;

  if (!e2eUserId || !e2eEmail) {
    return false;
  }

  const e2eClerkId = `e2e_${e2eUserId}`;

  let user;
  try {
    user = await prisma.user.upsert({
      where: { id: e2eUserId },
      create: { id: e2eUserId, email: e2eEmail, clerkId: e2eClerkId },
      update: { email: e2eEmail, clerkId: e2eClerkId },
    });
  } catch (error) {
    // Guard against transient unique conflicts (parallel E2E requests)
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    user = await prisma.user.findFirst({
      where: {
        OR: [{ id: e2eUserId }, { clerkId: e2eClerkId }, { email: e2eEmail }],
      },
    });
    if (!user) {
      throw error;
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data: { email: e2eEmail, clerkId: e2eClerkId },
    });
  }

  req.user = user;
  return true;
}
