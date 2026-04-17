/**
 * Slack Session Lock
 *
 * Postgres advisory lock that serializes concurrent turns from the same Slack
 * user across backend replicas. Replaces the single-process in-memory Map
 * previously used in `slack-session-orchestrator.ts`.
 *
 * Why advisory locks (not Redis, not a lock table):
 * - Fast enough for human-speed chat (< 1ms to acquire uncontended).
 * - Lifecycle tied to the DB connection: a process crash auto-releases.
 * - No new infrastructure — we already talk to Postgres via Prisma.
 *
 * Implementation notes:
 * - We wrap the whole turn in a `$transaction` because `pg_advisory_xact_lock`
 *   ties the lock to transaction lifetime (released on COMMIT / ROLLBACK /
 *   connection drop). Transactions are long-running by necessity here — the
 *   Sonnet call is typically 3–8s — so we extend the Prisma timeout.
 * - This holds a DB connection for the lock duration. Note that `fn()` runs
 *   on the global Prisma client (not `tx`), so each active turn holds TWO
 *   pool connections: one for this lock tx and one for the work. The real
 *   pool ceiling is therefore `pool_size / 2` concurrent turns, not
 *   `pool_size`. At MWF's scale (default 10-conn pool, <10 concurrent
 *   active turns → <5 concurrent locked turns) that's comfortable. If
 *   pool pressure becomes real, switch to a lock table with row-level
 *   locking + explicit expiry; the call-site API stays the same.
 */

import { prisma } from '../lib/prisma';

/**
 * Numeric namespace for our advisory locks. Chosen to be distinctive in the
 * `pg_locks` view so an operator can see at a glance which locks are ours.
 * Value: 'slck' as a 32-bit signed int.
 */
const LOCK_NAMESPACE = 1936024171;

/** Maximum time a single Slack turn can hold the lock before the tx aborts. */
const LOCK_TIMEOUT_MS = 60_000;

/**
 * Acquire an advisory lock keyed on the Slack user id, run `fn`, release.
 * Serializes turns from the same Slack user even across multiple backend
 * replicas. Lock releases automatically on transaction end or connection
 * loss (so a mid-turn crash doesn't leave a stuck lock).
 */
export async function withSlackUserLock<T>(
  slackUserId: string,
  fn: () => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // Blocking acquire — if another replica holds the lock for this user,
      // we queue behind it. Uses xact_lock so release is automatic at
      // transaction boundary.
      // Explicit ::int cast on the namespace: Prisma binds JS numbers as bigint,
      // and Postgres has no `pg_advisory_xact_lock(bigint, integer)` overload
      // (only (bigint) and (int, int)), so we must land on the (int, int) form.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${slackUserId}))
      `;
      return fn();
    },
    { timeout: LOCK_TIMEOUT_MS, maxWait: LOCK_TIMEOUT_MS }
  );
}
