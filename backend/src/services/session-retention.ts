/**
 * Session Retention
 *
 * Enforces the two-tier session decay policy for MWF conflict-resolution
 * sessions:
 *
 *   - `ACTIVE` / `WAITING` sessions with no activity for 90 days → `ARCHIVED`.
 *     Users can still read their own history (session row + related rows
 *     remain) but the session is no longer eligible for new turns.
 *   - `ARCHIVED` sessions that have sat for another 90 days (180 days total)
 *     → hard-deleted, cascading to messages / vessels / stage progress.
 *
 * This module is the business logic only. Scheduling is intentionally left
 * out — run it however the deploy environment prefers (a CLI wrapper in
 * `scripts/sweep-session-retention.ts`, a Render cron, a GitHub Actions
 * schedule, or the existing EC2 cron host.
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// Policy constants — exported for tests and ops observability.
export const ACTIVE_SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const ARCHIVED_SESSION_PURGE_MS = 90 * 24 * 60 * 60 * 1000; // 90d after archive → 180d total

export interface SessionRetentionResult {
  /** Sessions flipped from ACTIVE/WAITING → ARCHIVED on this run. */
  archived: number;
  /** Sessions hard-deleted (status=ARCHIVED and archived >90d ago). */
  deleted: number;
  /** Number of ACTIVE/WAITING sessions we inspected. */
  inspected: number;
}

/**
 * Run the session retention policy once. Idempotent — safe to call multiple
 * times; a session that's already ARCHIVED stays put, and already-deleted
 * sessions can't reappear.
 *
 * `now` is injectable for testing.
 */
export async function enforceSessionRetention(
  now: Date = new Date()
): Promise<SessionRetentionResult> {
  const archiveCutoff = new Date(now.getTime() - ACTIVE_SESSION_RETENTION_MS);
  const deleteCutoff = new Date(now.getTime() - ARCHIVED_SESSION_PURGE_MS);

  // ----- Archive phase -----
  // Pre-filter with `updatedAt` (cheap). Any session touched by status/gate
  // changes in the last 90d can't possibly be stale, so we skip them.
  // For each remaining candidate, confirm staleness via the latest message
  // timestamp — `updatedAt` doesn't reflect message writes, which are the
  // authoritative "activity" signal.
  const staleCandidates = await prisma.session.findMany({
    where: {
      type: 'CONFLICT_RESOLUTION',
      status: { in: ['ACTIVE', 'WAITING'] },
      updatedAt: { lt: archiveCutoff },
    },
    select: { id: true, updatedAt: true },
  });

  let archived = 0;
  for (const candidate of staleCandidates) {
    const lastMsg = await prisma.message.findFirst({
      where: { sessionId: candidate.id },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    const lastActivity = lastMsg?.timestamp ?? candidate.updatedAt;
    if (lastActivity >= archiveCutoff) continue;

    await prisma.session.update({
      where: { id: candidate.id },
      data: { status: 'ARCHIVED' },
    });
    archived++;
  }

  // ----- Hard-delete phase -----
  // Sessions that were ARCHIVED long enough ago that the soft-retention
  // window is up. Cascade via the Session FKs deletes messages, vessels,
  // stage progress, etc. in the same transaction.
  const deleteResult = await prisma.session.deleteMany({
    where: {
      status: 'ARCHIVED',
      updatedAt: { lt: deleteCutoff },
    },
  });

  const result: SessionRetentionResult = {
    archived,
    deleted: deleteResult.count,
    inspected: staleCandidates.length,
  };

  logger.info('[SessionRetention] Retention policy enforced', {
    ...result,
    archiveCutoff: archiveCutoff.toISOString(),
    deleteCutoff: deleteCutoff.toISOString(),
  });

  return result;
}
