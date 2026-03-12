/**
 * Theme Detector Service
 *
 * Cross-session intelligence layer: after each distillation, checks whether
 * the session's theme now appears in 3+ sessions. If the threshold is met,
 * generates a cross-session summary via Haiku and upserts a RecurringTheme row.
 *
 * Design constraints:
 * - Runs fire-and-forget — NEVER throws, wraps everything in try/catch
 * - 3-session minimum (HARD threshold from STATE.md decisions — never lower it)
 * - Always regenerates summary on every trigger above threshold
 * - Trigger AFTER distillation transaction commits so new takeaways are visible
 */

import { prisma } from '../lib/prisma';
import { getHaikuJson, BrainActivityCallType } from '../lib/bedrock';
import { withHaikuCircuitBreaker } from '../utils/circuit-breaker';
import { logger } from '../lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface DetectRecurringThemeInput {
  sessionId: string;
  userId: string;
  turnId: string;
}

interface SessionWithTakeaways {
  id: string;
  createdAt: Date;
  takeaways: Array<{ content: string }>;
}

// ============================================================================
// buildThemeSummaryPrompt
//
// Pure function — formats session takeaways into a Haiku prompt asking for a
// 2-3 sentence cross-session summary using the person's own words.
// Exported for testability.
// ============================================================================

export function buildThemeSummaryPrompt(
  tag: string,
  sessions: SessionWithTakeaways[],
): string {
  const sessionBlocks = sessions
    .map((s, i) => {
      const dateStr = s.createdAt.toISOString().slice(0, 10);
      const takeawayLines =
        s.takeaways.length > 0
          ? s.takeaways.map((t) => `- ${t.content}`).join('\n')
          : '(no takeaways yet)';
      return `Session ${i + 1} (${dateStr}):\n${takeawayLines}`;
    })
    .join('\n\n');

  return `The person has explored the theme "${tag}" across ${sessions.length} sessions. Here are the key takeaways from each session:

${sessionBlocks}

Write a 2-3 sentence cross-session summary of this recurring theme using the person's own words and verbatim key phrases wherever possible. Do NOT add psychological labels or clinical interpretations.

OUTPUT JSON only: { "summary": "..." }`;
}

// ============================================================================
// detectRecurringTheme
//
// Main function. Called fire-and-forget after distillation completes.
// Flow:
// 1. Fetch session's theme — guard if none
// 2. Count sessions with this theme — guard if < 3
// 3. Fetch all sessions with this theme (including takeaways)
// 4. Call Haiku via circuit breaker — guard if null/empty result
// 5. Upsert RecurringTheme (always regenerate summary)
// 6. Log success
//
// CRITICAL: Never throws. All errors are caught and logged at the top level.
// ============================================================================

export async function detectRecurringTheme({
  sessionId,
  userId,
  turnId,
}: DetectRecurringThemeInput): Promise<void> {
  try {
    // 1. Fetch session's theme
    const session = await prisma.innerWorkSession.findFirst({
      where: { id: sessionId, userId },
      select: { theme: true },
    });

    const tag = session?.theme;
    if (!tag) {
      return;
    }

    // 2. Count sessions with this theme (HARD threshold: 3 minimum)
    const sessionCount = await prisma.innerWorkSession.count({
      where: {
        userId,
        theme: tag,
        status: { not: 'ARCHIVED' as const },
      },
    });

    if (sessionCount < 3) {
      return;
    }

    // 3. Fetch all sessions with this theme for summarization
    const sessions = await (prisma.innerWorkSession.findMany as any)({
      where: {
        userId,
        theme: tag,
        status: { not: 'ARCHIVED' as const },
      },
      select: {
        id: true,
        createdAt: true,
        takeaways: {
          select: { content: true },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    }) as SessionWithTakeaways[];

    // 4. Call Haiku via circuit breaker
    const result = await withHaikuCircuitBreaker(
      async () =>
        getHaikuJson<{ summary: string }>({
          systemPrompt:
            'You synthesize recurring themes from a person\'s journal sessions. Use their own words. Do NOT add psychological labels or clinical interpretations. Output ONLY valid JSON.',
          messages: [
            {
              role: 'user',
              content: buildThemeSummaryPrompt(tag, sessions),
            },
          ],
          maxTokens: 512,
          innerWorkSessionId: sessionId,
          turnId,
          operation: 'cross-session-theme',
          callType: BrainActivityCallType.CROSS_SESSION_THEME,
        }),
      null,
      'cross-session-theme',
    );

    // 5. Guard: don't write empty summaries
    if (!result?.summary) {
      return;
    }

    // 6. Upsert RecurringTheme — always regenerate summary above threshold
    await (prisma.recurringTheme as any).upsert({
      where: {
        userId_tag: { userId, tag },
      },
      create: {
        userId,
        tag,
        sessionCount,
        summary: result.summary,
        summaryAt: new Date(),
      },
      update: {
        sessionCount,
        summary: result.summary,
        summaryAt: new Date(),
      },
    });

    logger.info('[ThemeDetector] Upserted recurring theme', { tag, sessionCount, userId });
  } catch (err) {
    logger.error('[ThemeDetector] Unexpected error during theme detection (non-fatal):', err);
  }
}
