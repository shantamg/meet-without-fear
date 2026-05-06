/**
 * Row-Level Security (RLS) Helpers
 *
 * Provides utilities for setting the PostgreSQL session variable
 * `app.current_user_id` within Prisma interactive transactions, enabling
 * database-level data isolation via RLS policies.
 *
 * ## How it works
 *
 * 1. `withRLS(userId, fn)` opens a Prisma interactive transaction.
 * 2. It calls `SET LOCAL app.current_user_id = '<userId>'` — `LOCAL` scopes
 *    the variable to the transaction so it cannot leak across connections.
 * 3. The callback `fn(tx)` runs its queries on the transaction client,
 *    which shares the same connection and sees the session variable.
 *
 * ## When RLS is enforced
 *
 * RLS policies are bypassed when connecting as the database owner.
 * Enforcement requires a non-owner application role (see migration
 * `20260507000000_reenable_rls` header for activation steps).
 * Even without enforcement, calling `withRLS` is a no-op preparation:
 * the variable is set, policies exist, and activation becomes a
 * connection-string change with no further code changes.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Tables protected by RLS policies (must match migration). */
export const RLS_PROTECTED_TABLES = new Set([
  'InnerWorkSession',
  'InnerWorkMessage',
  'UserVessel',
  'UserMemory',
  'StageProgress',
  'EmpathyDraft',
  'ConsentRecord',
  'PreSessionMessage',
  'ValidationFeedbackDraft',
  'Message',
  'EmpathyAttempt',
]);

/**
 * Execute database operations with RLS user context.
 *
 * Sets `app.current_user_id` via `SET LOCAL` within an interactive
 * transaction, ensuring RLS policies see the correct user.
 *
 * @example
 * ```ts
 * const vessels = await withRLS(userId, (tx) =>
 *   tx.userVessel.findMany({ where: { sessionId } })
 * );
 * ```
 */
export async function withRLS<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}
