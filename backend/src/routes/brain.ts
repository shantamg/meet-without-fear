
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

    // Fetch canonical User messages for clean display
    const messages = await prisma.message.findMany({
      where: { sessionId, role: 'USER' },
      orderBy: { timestamp: 'asc' },
      select: { id: true, content: true, timestamp: true, senderId: true }
    });

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
    const sessions = await prisma.session.findMany({
      take: 50,
      orderBy: { updatedAt: 'desc' },
      include: {
        relationship: {
          include: {
            members: { include: { user: true } }
          }
        }
      }
    });

    // Aggregate stats for these sessions
    const sessionIds = sessions.map(s => s.id);
    const stats = await prisma.brainActivity.groupBy({
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
        sessionId: { in: sessionIds }
      }
    });

    // Estimate user turns from Messages
    const turnCounts = await prisma.message.groupBy({
      by: ['sessionId'],
      _count: {
        id: true
      },
      where: {
        sessionId: { in: sessionIds },
        role: 'USER'
      }
    });

    const sessionsWithStats = sessions.map(session => {
      const stat = stats.find(s => s.sessionId === session.id);
      const turns = turnCounts.find(t => t.sessionId === session.id);
      return {
        ...session,
        stats: {
          totalCost: stat?._sum.cost || 0,
          totalTokens: (stat?._sum.tokenCountInput || 0) + (stat?._sum.tokenCountOutput || 0),
          activityCount: stat?._count.id || 0,
          turnCount: turns?._count.id || 0
        }
      };
    });

    return successResponse(res, { sessions: sessionsWithStats });
  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch sessions:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch sessions', 500);
  }
});

export default router;
