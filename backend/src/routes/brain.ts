
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { errorResponse, successResponse } from '../utils/response';

const router = Router();

// Get all brain activities for a session
router.get('/activity/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const activities = await prisma.brainActivity.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    // Try fetching as partner session messages first
    let messages = await prisma.message.findMany({
      where: { sessionId, role: 'USER' },
      orderBy: { timestamp: 'asc' },
      select: { id: true, content: true, timestamp: true, senderId: true }
    });

    // If no messages found, it might be an Inner Work session
    if (messages.length === 0) {
      const innerMessages = await prisma.innerWorkMessage.findMany({
        where: { sessionId, role: 'USER' },
        orderBy: { timestamp: 'asc' },
        select: { id: true, content: true, timestamp: true }
      });

      // Map to same structure (senderId is not needed for Inner Work as it's implied)
      messages = innerMessages.map(m => ({
        ...m,
        senderId: null
      }));
    }

    // Calculate summary stats
    const totalCost = activities.reduce((sum: number, a: any) => sum + (a.cost || 0), 0);
    const totalTokens = activities.reduce((sum: number, a: any) => sum + ((a.tokenCountInput || 0) + (a.tokenCountOutput || 0)), 0);

    return successResponse(res, {
      activities,
      messages,
      summary: {
        totalCost,
        totalTokens,
        count: activities.length
      }
    });

  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch activities:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch session activity', 500);
  }
});

// Get sessions list (replacement for audit/sessions)
router.get('/sessions', async (req, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string || '20', 10);
    const fetchLimit = limit + 1; // Fetch one extra to detect next page

    // Common where clause for cursor pagination
    const whereClause = cursor
      ? { updatedAt: { lt: new Date(cursor) } }
      : {};

    // 1. Fetch Partner Sessions
    const partnerSessions = await prisma.session.findMany({
      take: fetchLimit,
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
      include: {
        relationship: {
          include: {
            members: { include: { user: true } }
          }
        }
      }
    });

    // 2. Fetch Inner Work Sessions
    const innerWorkSessions = await prisma.innerWorkSession.findMany({
      take: fetchLimit,
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: true // Include user for display name if needed
      }
    });

    // 3. Aggregate stats for ALL sessions
    const partnerSessionIds = partnerSessions.map(s => s.id);
    const innerSessionIds = innerWorkSessions.map(s => s.id);
    const allSessionIds = [...partnerSessionIds, ...innerSessionIds];

    // Only fetch stats if we have sessions
    let stats: any[] = [];
    if (allSessionIds.length > 0) {
      stats = await (prisma.brainActivity.groupBy as any)({
        by: ['sessionId'],
        _sum: {
          cost: true,
          tokenCountInput: true,
          tokenCountOutput: true,
        },
        _count: {
          id: true,
        },
        where: {
          sessionId: { in: allSessionIds }
        }
      });
    }

    // 4. Estimate user turns (Partner Sessions)
    let partnerTurnCounts: any[] = [];
    if (partnerSessionIds.length > 0) {
      partnerTurnCounts = await (prisma.message.groupBy as any)({
        by: ['sessionId'],
        _count: { id: true },
        where: {
          sessionId: { in: partnerSessionIds },
          role: 'USER'
        }
      });
    }

    // 5. Estimate user turns (Inner Work Sessions)
    let innerTurnCounts: any[] = [];
    if (innerSessionIds.length > 0) {
      innerTurnCounts = await (prisma.innerWorkMessage.groupBy as any)({
        by: ['sessionId'],
        _count: { id: true },
        where: {
          sessionId: { in: innerSessionIds },
          role: 'USER'
        }
      });
    }

    // 6. Map and Merge
    const mappedPartnerSessions = partnerSessions.map(session => {
      const stat = stats.find(s => s.sessionId === session.id);
      const turns = partnerTurnCounts.find(t => t.sessionId === session.id);
      return {
        id: session.id,
        type: 'PARTNER',
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        // UI specific fields
        title: null, // Partner sessions use relationship members
        relationship: session.relationship,
        stats: {
          totalCost: stat?._sum.cost || 0,
          totalTokens: (stat?._sum.tokenCountInput || 0) + (stat?._sum.tokenCountOutput || 0),
          activityCount: stat?._count.id || 0,
          turnCount: turns?._count.id || 0
        }
      };
    });

    const mappedInnerSessions = innerWorkSessions.map(session => {
      const stat = stats.find(s => s.sessionId === session.id);
      const turns = innerTurnCounts.find(t => t.sessionId === session.id);
      return {
        id: session.id,
        type: 'INNER_WORK',
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        // UI specific fields
        title: session.title || 'Untitled Session',
        relationship: null, // No relationship for inner work
        user: session.user,
        stats: {
          totalCost: stat?._sum.cost || 0,
          totalTokens: (stat?._sum.tokenCountInput || 0) + (stat?._sum.tokenCountOutput || 0),
          activityCount: stat?._count.id || 0,
          turnCount: turns?._count.id || 0
        }
      };
    });

    // Combine and sort by updatedAt desc
    let allSessions = [...mappedPartnerSessions, ...mappedInnerSessions]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // Determine next cursor (NOTE: complex since we merge two sources)
    // We fetched limited from EACH source, so we have potentially 2*limit items
    // We take top limit items
    const hasNextPage = allSessions.length > limit;
    if (hasNextPage) {
      allSessions = allSessions.slice(0, limit);
    }

    const nextCursor = hasNextPage && allSessions.length > 0
      ? allSessions[allSessions.length - 1].updatedAt.toISOString()
      : null;

    return successResponse(res, {
      sessions: allSessions,
      nextCursor
    });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch sessions:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch sessions', 500);
  }
});

export default router;
