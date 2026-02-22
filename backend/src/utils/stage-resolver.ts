import { prisma } from '../lib/prisma';

interface StageInterval {
  stage: number;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Resolves which stage a session was in at a given time by looking at StageProgress timestamps.
 * Returns a map of sessionId -> sorted stage intervals.
 */
export async function resolveStageIntervalsForSessions(
  sessionIds: string[],
): Promise<Map<string, StageInterval[]>> {
  if (sessionIds.length === 0) return new Map();

  const progressRecords = await prisma.stageProgress.findMany({
    where: { sessionId: { in: sessionIds } },
    orderBy: { startedAt: 'asc' },
    select: {
      sessionId: true,
      stage: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const sessionIntervals = new Map<string, StageInterval[]>();

  for (const record of progressRecords) {
    if (!sessionIntervals.has(record.sessionId)) {
      sessionIntervals.set(record.sessionId, []);
    }
    sessionIntervals.get(record.sessionId)!.push({
      stage: record.stage,
      startedAt: record.startedAt,
      endedAt: record.completedAt,
    });
  }

  return sessionIntervals;
}

/**
 * Given stage intervals for a session, resolves the stage active at a specific timestamp.
 * Falls back to stage 0 if no stage progress exists.
 */
export function resolveStageForTimestamp(
  intervals: StageInterval[] | undefined,
  timestamp: Date,
): number {
  if (!intervals || intervals.length === 0) return 0;

  // Find the latest stage that started before or at this timestamp
  let resolvedStage = 0;
  for (const interval of intervals) {
    if (interval.startedAt <= timestamp) {
      resolvedStage = interval.stage;
    }
  }
  return resolvedStage;
}
