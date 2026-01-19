
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { errorResponse, successResponse } from '../utils/response';
import { assembleContextBundle, type ContextBundle } from '../services/context-assembler';
import { determineMemoryIntent } from '../services/memory-intent';

const router = Router();

// ============================================================================
// Response Types
// ============================================================================

interface ContextUserData {
  userId: string;
  userName: string;
  context: ContextBundle;
}

interface ContextResponse {
  sessionId: string;
  sessionType: 'partner' | 'inner_thoughts';
  assembledAt: string;
  users: ContextUserData[];
}

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

    // Fetch notable facts from UserVessel for this session
    const userVessels = await prisma.userVessel.findMany({
      where: { sessionId },
      select: { userId: true, notableFacts: true }
    });

    // Combine all notable facts from all users in this session
    const notableFacts = userVessels.flatMap(v => v.notableFacts);

    // Calculate summary stats
    const totalCost = activities.reduce((sum: number, a: any) => sum + (a.cost || 0), 0);
    const totalTokens = activities.reduce((sum: number, a: any) => sum + ((a.tokenCountInput || 0) + (a.tokenCountOutput || 0)), 0);

    return successResponse(res, {
      activities,
      messages,
      notableFacts,
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

// Get assembled context bundle for a session
// This endpoint assembles the full context bundle for each user in the session,
// allowing the Neural Monitor dashboard to display exactly what context the AI receives.
router.get('/sessions/:sessionId/context', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // First try as partner session
    const partnerSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        relationship: {
          include: {
            members: {
              include: { user: true }
            }
          }
        },
        stageProgress: {
          orderBy: { stage: 'desc' }
        }
      }
    });

    if (partnerSession) {
      // Partner session - assemble context for all users
      const users = partnerSession.relationship.members;
      const now = new Date().toISOString();

      // Get the current stage for each user (use their latest stage progress)
      const contextResults = await Promise.all(
        users.map(async (member) => {
          const userProgress = partnerSession.stageProgress.find(
            (p) => p.userId === member.userId
          );
          const stage = userProgress?.stage ?? 1;

          try {
            // Get emotional intensity from UserVessel
            const vessel = await prisma.userVessel.findUnique({
              where: { userId_sessionId: { userId: member.userId, sessionId } },
              select: { id: true },
            });

            let emotionalIntensity = 5; // Default moderate intensity
            if (vessel) {
              const latestReading = await prisma.emotionalReading.findFirst({
                where: { vesselId: vessel.id },
                orderBy: { timestamp: 'desc' },
                select: { intensity: true },
              });
              if (latestReading) {
                emotionalIntensity = latestReading.intensity;
              }
            }

            // Get turn count from messages
            const turnCount = await prisma.message.count({
              where: { sessionId, senderId: member.userId },
            });

            // Determine memory intent (required for context assembly)
            const intent = determineMemoryIntent({
              stage,
              emotionalIntensity,
              userMessage: '', // Empty - we're just assembling current context
              turnCount,
              isFirstTurnInSession: turnCount === 0,
            });

            // Assemble the context bundle
            const context = await assembleContextBundle(
              sessionId,
              member.userId,
              stage,
              intent
            );

            return {
              userId: member.userId,
              userName: member.user.name || 'Unknown',
              context,
            };
          } catch (error) {
            console.error(`[BrainRoutes] Failed to assemble context for user ${member.userId}:`, error);
            // Return placeholder for failed user
            return {
              userId: member.userId,
              userName: member.user.name || 'Unknown',
              context: null,
            };
          }
        })
      );

      const response: ContextResponse = {
        sessionId,
        sessionType: 'partner',
        assembledAt: now,
        users: contextResults.filter((r): r is ContextUserData => r.context !== null),
      };

      return successResponse(res, response);
    }

    // Try as inner work session
    const innerWorkSession = await prisma.innerWorkSession.findUnique({
      where: { id: sessionId },
      include: {
        user: true
      }
    });

    if (innerWorkSession) {
      // Inner work sessions don't use assembleContextBundle (different flow)
      // Return a simplified response indicating this is an inner thoughts session
      const response: ContextResponse = {
        sessionId,
        sessionType: 'inner_thoughts',
        assembledAt: new Date().toISOString(),
        users: [{
          userId: innerWorkSession.userId,
          userName: innerWorkSession.user.name || 'Unknown',
          // For inner work sessions, create a minimal context bundle
          // This could be enhanced later if needed
          context: {
            conversationContext: {
              recentTurns: [],
              turnCount: 0,
              sessionDurationMinutes: 0,
            },
            emotionalThread: {
              initialIntensity: null,
              currentIntensity: null,
              trend: 'unknown',
              notableShifts: [],
            },
            stageContext: {
              stage: 0,
              gatesSatisfied: {},
            },
            userName: innerWorkSession.user.name || 'Unknown',
            intent: {
              intent: 'avoid_recall',
              depth: 'none',
              allowCrossSession: false,
              surfaceStyle: 'silent',
              reason: 'Inner work sessions have different context flow',
              threshold: 0.5,
              maxCrossSession: 0,
            },
            assembledAt: new Date().toISOString(),
          },
        }],
      };

      return successResponse(res, response);
    }

    // Session not found
    return errorResponse(res, 'NOT_FOUND', 'Session not found', 404);

  } catch (error) {
    console.error('[BrainRoutes] Failed to fetch session context:', error);
    return errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch session context', 500);
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
