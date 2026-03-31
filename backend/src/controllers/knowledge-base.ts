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
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errors';
import { searchTakeaways } from '../services/embedding';
import { mapTakeawayToDTO } from '../services/distillation';
import type {
  ApiResponse,
  KnowledgeBaseTopicDTO,
  TopicSessionEntryDTO,
  ListTopicsResponse,
  GetTopicTimelineResponse,
  RecurringThemeDTO,
  ListRecurringThemesResponse,
  SearchKnowledgeBaseResponse,
  RecentTakeawaysResponse,
  TakeawayLinkDTO,
  GetTakeawayLinksResponse,
  CreateTakeawayLinkRequest,
  CreateTakeawayLinkResponse,
  DeleteTakeawayLinkResponse,
  TakeawayThreadDTO,
  TakeawayDTO,
  ResolveTakeawayResponse,
  ListActionsResponse,
} from '@meet-without-fear/shared';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Maps a session (with takeaways) to a TopicSessionEntryDTO.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSessionToTopicEntry(session: {
  id: string;
  title: string | null;
  createdAt: Date;
  takeaways: any[];
}): TopicSessionEntryDTO {
  return {
    sessionId: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    takeaways: session.takeaways.map((t) => ({
      id: t.id,
      content: t.content,
      theme: t.theme,
      type: t.type ?? 'INSIGHT',
      resolved: t.resolved ?? false,
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

// ============================================================================
// Search (SEARCH-01, SEARCH-02, SEARCH-03)
// ============================================================================

/**
 * GET /knowledge-base/search?q=<text>&limit=10
 * Semantic search across all takeaways via vector embeddings.
 */
export const searchKnowledgeBase = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const query = (req.query.q as string) || '';
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);

  if (query.length < 2) {
    res.json({
      success: true,
      data: { results: [], query },
    } as ApiResponse<SearchKnowledgeBaseResponse>);
    return;
  }

  const matches = await searchTakeaways(user.id, query, limit, 0.45);

  const response: ApiResponse<SearchKnowledgeBaseResponse> = {
    success: true,
    data: {
      query,
      results: matches.map((m) => ({
        takeawayId: m.takeawayId,
        content: m.content,
        theme: m.theme,
        type: m.type as 'INSIGHT' | 'ACTION_ITEM' | 'INTENTION',
        sessionDate: m.sessionDate,
        sessionId: m.sessionId,
        similarity: m.similarity,
      })),
    },
  };

  res.json(response);
});

// ============================================================================
// Recent Takeaways (UI-03)
// ============================================================================

/**
 * GET /knowledge-base/recent?limit=3
 * Returns the most recently created takeaways across all sessions.
 */
export const listRecentTakeaways = asyncHandler(async (req: Request, res: Response) => {
  const user = getUser(req);
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 3, 20);

  const takeaways = await prisma.sessionTakeaway.findMany({
    where: {
      session: {
        userId: user.id,
        status: { not: 'ARCHIVED' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      session: { select: { createdAt: true } },
    },
  });

  const response: ApiResponse<RecentTakeawaysResponse> = {
    success: true,
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      takeaways: takeaways.map((t: any) => ({
        id: t.id,
        content: t.content,
        theme: t.theme,
        type: t.type ?? 'INSIGHT',
        sessionDate: t.session.createdAt.toISOString(),
        sessionId: t.sessionId,
      })),
    },
  };

  res.json(response);
});

// ============================================================================
// Takeaway Links (LINK-01 through LINK-04)
// ============================================================================

/**
 * GET /knowledge-base/takeaways/:id/links
 * Returns all linked takeaways (both directions: outgoing + incoming).
 */
export const getTakeawayLinks = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const takeawayId = req.params.id;

  // Verify ownership
  const takeaway = await prisma.sessionTakeaway.findFirst({
    where: {
      id: takeawayId,
      session: { userId: user.id },
    },
  });

  if (!takeaway) {
    throw new NotFoundError('Takeaway not found');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;

  // Fetch outgoing links (this takeaway → other)
  const outgoing = await prismaAny.takeawayLink.findMany({
    where: { sourceId: takeawayId },
    include: {
      target: {
        include: { session: { select: { createdAt: true } } },
      },
    },
  });

  // Fetch incoming links (other → this takeaway)
  const incoming = await prismaAny.takeawayLink.findMany({
    where: { targetId: takeawayId },
    include: {
      source: {
        include: { session: { select: { createdAt: true } } },
      },
    },
  });

  const links: TakeawayLinkDTO[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...outgoing.map((link: any) => ({
      id: link.id,
      linkedTakeaway: {
        id: link.target.id,
        content: link.target.content,
        theme: link.target.theme,
        type: link.target.type ?? 'INSIGHT',
        sessionDate: link.target.session.createdAt.toISOString(),
      },
      linkType: link.linkType,
      similarity: link.similarity,
      createdAt: link.createdAt.toISOString(),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...incoming.map((link: any) => ({
      id: link.id,
      linkedTakeaway: {
        id: link.source.id,
        content: link.source.content,
        theme: link.source.theme,
        type: link.source.type ?? 'INSIGHT',
        sessionDate: link.source.session.createdAt.toISOString(),
      },
      linkType: link.linkType,
      similarity: link.similarity,
      createdAt: link.createdAt.toISOString(),
    })),
  ];

  // Deduplicate by linked takeaway ID (a pair could exist in both directions)
  const seen = new Set<string>();
  const uniqueLinks = links.filter((link) => {
    if (seen.has(link.linkedTakeaway.id)) return false;
    seen.add(link.linkedTakeaway.id);
    return true;
  });

  const response: ApiResponse<GetTakeawayLinksResponse> = {
    success: true,
    data: { links: uniqueLinks },
  };

  res.json(response);
});

/**
 * POST /knowledge-base/takeaways/:id/links
 * Create a manual link between two takeaways.
 */
export const createTakeawayLink = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const sourceId = req.params.id;
  const { targetId } = req.body as CreateTakeawayLinkRequest;

  if (!targetId) {
    throw new ValidationError('targetId is required');
  }

  if (sourceId === targetId) {
    throw new ValidationError('Cannot link a takeaway to itself');
  }

  // Verify both takeaways belong to this user
  const [source, target] = await Promise.all([
    prisma.sessionTakeaway.findFirst({
      where: { id: sourceId, session: { userId: user.id } },
      include: { session: { select: { createdAt: true } } },
    }),
    prisma.sessionTakeaway.findFirst({
      where: { id: targetId, session: { userId: user.id } },
      include: { session: { select: { createdAt: true } } },
    }),
  ]);

  if (!source || !target) {
    throw new NotFoundError('One or both takeaways not found');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;

  try {
    const link = await prismaAny.takeawayLink.create({
      data: {
        sourceId,
        targetId,
        linkType: 'USER_MANUAL',
      },
    });

    const response: ApiResponse<CreateTakeawayLinkResponse> = {
      success: true,
      data: {
        link: {
          id: link.id,
          linkedTakeaway: {
            id: target.id,
            content: target.content,
            theme: target.theme,
            type: (target as any).type ?? 'INSIGHT',
            sessionDate: target.session.createdAt.toISOString(),
          },
          linkType: 'USER_MANUAL',
          similarity: null,
          createdAt: link.createdAt.toISOString(),
        },
      },
    };

    res.status(201).json(response);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ success: false, error: 'Link already exists' });
      return;
    }
    throw err;
  }
});

/**
 * DELETE /knowledge-base/takeaways/:id/links/:linkId
 * Remove a manual link (only USER_MANUAL links can be deleted by the user).
 */
export const deleteTakeawayLink = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const takeawayId = req.params.id;
  const linkId = req.params.linkId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;

  // Verify the link exists and belongs to the user's takeaway
  const link = await prismaAny.takeawayLink.findFirst({
    where: {
      id: linkId,
      OR: [
        { sourceId: takeawayId },
        { targetId: takeawayId },
      ],
    },
  });

  if (!link) {
    throw new NotFoundError('Link not found');
  }

  // Verify user ownership via the takeaway
  const takeaway = await prisma.sessionTakeaway.findFirst({
    where: { id: takeawayId, session: { userId: user.id } },
  });

  if (!takeaway) {
    throw new NotFoundError('Takeaway not found');
  }

  // Only allow deletion of USER_MANUAL links
  if (link.linkType !== 'USER_MANUAL') {
    throw new ValidationError('Only manually created links can be deleted');
  }

  await prismaAny.takeawayLink.delete({ where: { id: linkId } });

  const response: ApiResponse<DeleteTakeawayLinkResponse> = {
    success: true,
    data: { success: true },
  };

  res.json(response);
});

// ============================================================================
// Thought Thread (LINK-03)
// ============================================================================

/**
 * GET /knowledge-base/takeaways/:id/thread
 * Traverses all links (breadth-first, max depth 3) to build the full connected
 * thought chain. Returns the root + all connected takeaways chronologically.
 */
export const getTakeawayThread = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const rootId = req.params.id;

  // Verify root ownership
  const root = await prisma.sessionTakeaway.findFirst({
    where: { id: rootId, session: { userId: user.id } },
    include: { session: { select: { createdAt: true } } },
  });

  if (!root) {
    throw new NotFoundError('Takeaway not found');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;

  // BFS traversal — max depth 3
  const visited = new Set<string>([rootId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threadItems: Array<{ takeaway: any; linkType: string }> = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= 3) continue;

    const outgoing = await prismaAny.takeawayLink.findMany({
      where: { sourceId: current.id },
      include: {
        target: { include: { session: { select: { createdAt: true } } } },
      },
    });

    const incoming = await prismaAny.takeawayLink.findMany({
      where: { targetId: current.id },
      include: {
        source: { include: { session: { select: { createdAt: true } } } },
      },
    });

    for (const link of outgoing) {
      if (!visited.has(link.targetId)) {
        visited.add(link.targetId);
        threadItems.push({ takeaway: link.target, linkType: link.linkType });
        queue.push({ id: link.targetId, depth: current.depth + 1 });
      }
    }

    for (const link of incoming) {
      if (!visited.has(link.sourceId)) {
        visited.add(link.sourceId);
        threadItems.push({ takeaway: link.source, linkType: link.linkType });
        queue.push({ id: link.sourceId, depth: current.depth + 1 });
      }
    }
  }

  // Sort thread chronologically
  threadItems.sort(
    (a, b) =>
      new Date(a.takeaway.session.createdAt).getTime() -
      new Date(b.takeaway.session.createdAt).getTime()
  );

  const rootDTO: TakeawayDTO & { sessionDate: string } = {
    ...mapTakeawayToDTO(root as any),
    sessionDate: root.session.createdAt.toISOString(),
  };

  const response: ApiResponse<TakeawayThreadDTO> = {
    success: true,
    data: {
      root: rootDTO,
      thread: threadItems.map((item) => ({
        ...mapTakeawayToDTO(item.takeaway),
        sessionDate: item.takeaway.session.createdAt.toISOString(),
        linkType: item.linkType as any,
      })),
    },
  };

  res.json(response);
});

// ============================================================================
// Action Item Resolution (ACTION-01 through ACTION-04)
// ============================================================================

/**
 * PATCH /knowledge-base/takeaways/:id/resolve
 * Toggles the resolved state of a takeaway.
 */
export const resolveTakeaway = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  const takeawayId = req.params.id;

  const takeaway = await prisma.sessionTakeaway.findFirst({
    where: { id: takeawayId, session: { userId: user.id } },
  });

  if (!takeaway) {
    throw new NotFoundError('Takeaway not found');
  }

  // Toggle resolved state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentResolved = (takeaway as any).resolved ?? false;
  const updated = await prisma.sessionTakeaway.update({
    where: { id: takeawayId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      resolved: !currentResolved,
      resolvedAt: !currentResolved ? new Date() : null,
    } as any,
  });

  const response: ApiResponse<ResolveTakeawayResponse> = {
    success: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { takeaway: mapTakeawayToDTO(updated as any) },
  };

  res.json(response);
});

/**
 * GET /knowledge-base/actions?status=open|resolved|all
 * Returns action items for the user, with optional status filter.
 */
export const listActions = asyncHandler(async (req: Request, res: Response) => {
  const user = getUser(req);
  const status = (req.query.status as string) || 'open';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    session: {
      userId: user.id,
      status: { not: 'ARCHIVED' },
    },
    type: 'ACTION_ITEM',
  };

  if (status === 'open') {
    where.resolved = false;
  } else if (status === 'resolved') {
    where.resolved = true;
  }
  // 'all' — no additional filter

  const takeaways = await prisma.sessionTakeaway.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      session: { select: { createdAt: true, theme: true } },
    },
  });

  const response: ApiResponse<ListActionsResponse> = {
    success: true,
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: takeaways.map((t: any) => ({
        ...mapTakeawayToDTO(t),
        sessionDate: t.session.createdAt.toISOString(),
        topicTag: t.session.theme,
      })),
    },
  };

  res.json(response);
});
