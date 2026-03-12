/**
 * Knowledge Base Controllers
 *
 * Read-side API for browsing the inner thoughts knowledge base:
 * - GET /knowledge-base/topics - Sessions grouped by theme tag
 * - GET /knowledge-base/topics/:tag - Chronological timeline for a given theme
 * - GET /knowledge-base/themes - Recurring themes sorted by frequency
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getUser } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import type {
  ApiResponse,
  KnowledgeBaseTopicDTO,
  TopicSessionEntryDTO,
  ListTopicsResponse,
  GetTopicTimelineResponse,
  RecurringThemeDTO,
  ListRecurringThemesResponse,
} from '@meet-without-fear/shared';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Maps a session (with takeaways) to a TopicSessionEntryDTO.
 */
function mapSessionToTopicEntry(session: {
  id: string;
  title: string | null;
  createdAt: Date;
  takeaways: Array<{ id: string; content: string; theme: string | null }>;
}): TopicSessionEntryDTO {
  return {
    sessionId: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    takeaways: session.takeaways.map((t) => ({
      id: t.id,
      content: t.content,
      theme: t.theme,
    })),
  };
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * GET /knowledge-base/topics
 * Returns all sessions grouped by theme tag. Groups are sorted by lastActivity
 * descending (most recently active topic first). Sessions with null theme are
 * excluded. ARCHIVED sessions are excluded.
 */
export const listTopics = asyncHandler(async (req: Request, res: Response) => {
  const user = getUser(req);

  const sessions = await prisma.innerWorkSession.findMany({
    where: {
      userId: user.id,
      status: { not: 'ARCHIVED' },
      theme: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      takeaways: { orderBy: { position: 'asc' } },
    },
  });

  // Group in application layer (Prisma groupBy does not support include)
  const topicMap = new Map<string, KnowledgeBaseTopicDTO>();

  for (const session of sessions) {
    const tag = session.theme!; // guaranteed non-null by where clause
    const entry = mapSessionToTopicEntry(session);

    if (topicMap.has(tag)) {
      const existing = topicMap.get(tag)!;
      existing.sessionCount += 1;
      existing.takeawayCount += session.takeaways.length;
      // Track the most recent updatedAt as lastActivity
      if (session.updatedAt.toISOString() > existing.lastActivity) {
        existing.lastActivity = session.updatedAt.toISOString();
      }
      existing.sessions.push(entry);
    } else {
      topicMap.set(tag, {
        tag,
        sessionCount: 1,
        takeawayCount: session.takeaways.length,
        lastActivity: session.updatedAt.toISOString(),
        sessions: [entry],
      });
    }
  }

  // Sort groups by lastActivity descending (most recent first)
  const topics = Array.from(topicMap.values()).sort((a, b) =>
    b.lastActivity.localeCompare(a.lastActivity)
  );

  const response: ApiResponse<ListTopicsResponse> = {
    success: true,
    data: { topics },
  };

  res.json(response);
});

/**
 * GET /knowledge-base/topics/:tag
 * Returns sessions for a given theme tag in chronological order (oldest first).
 * The tag parameter is URL-decoded to handle spaces and special characters.
 */
export const getTopicTimeline = asyncHandler(async (req: Request, res: Response) => {
  const user = getUser(req);
  // CRITICAL: always decode to handle spaces and special characters
  const tag = decodeURIComponent(req.params.tag);

  const sessions = await prisma.innerWorkSession.findMany({
    where: {
      userId: user.id,
      theme: tag,
      status: { not: 'ARCHIVED' },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      takeaways: { orderBy: { position: 'asc' } },
    },
  });

  const response: ApiResponse<GetTopicTimelineResponse> = {
    success: true,
    data: {
      tag,
      sessions: sessions.map(mapSessionToTopicEntry),
    },
  };

  res.json(response);
});

/**
 * GET /knowledge-base/themes
 * Returns recurring themes for the user, sorted by sessionCount descending
 * (most frequently recurring themes first). Only themes with 3+ sessions are
 * stored (enforced by the background-classifier service).
 */
export const listRecurringThemes = asyncHandler(async (req: Request, res: Response) => {
  const user = getUser(req);

  const themes = await prisma.recurringTheme.findMany({
    where: { userId: user.id },
    orderBy: { sessionCount: 'desc' },
  });

  const response: ApiResponse<ListRecurringThemesResponse> = {
    success: true,
    data: {
      themes: themes.map(
        (t): RecurringThemeDTO => ({
          tag: t.tag,
          sessionCount: t.sessionCount,
          summary: t.summary,
          summaryAt: t.summaryAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })
      ),
    },
  };

  res.json(response);
});
