/**
 * Prisma RLS (Row Level Security) Helper
 *
 * Provides a way to execute queries within a transaction that has
 * the `app.current_user_id` session variable set, enabling PostgreSQL
 * RLS policies to filter rows by the current user.
 *
 * Usage:
 *   const result = await withUserContext(userId, async (tx) => {
 *     return tx.innerWorkSession.findMany(); // automatically filtered by userId
 *   });
 *
 * Note: RLS enforcement requires the app to connect as a non-owner role
 * (see migration 20260311000000_add_row_level_security for setup).
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Execute a callback within a Prisma transaction that has the
 * current user's ID set as a PostgreSQL session variable.
 *
 * This enables RLS policies to automatically filter queries to
 * only return rows belonging to the specified user.
 */
export async function withUserContext<T>(
  userId: string,
  callback: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // SET LOCAL only applies to the current transaction
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return callback(tx);
  });
}

/**
 * Create a raw SQL fragment that sets the user context.
 * Useful when you need to compose with other raw queries.
 */
export function setUserContextSql(userId: string): Prisma.Sql {
  return Prisma.sql`SELECT set_config('app.current_user_id', ${userId}, true)`;
}
