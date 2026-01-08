
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errors';
import { ApiResponse } from '@meet-without-fear/shared';

/**
 * Get a list of sessions that have audit logs.
 * Returns unique session IDs and their latest timestamp.
 */
export const getSessions = asyncHandler(async (req: Request, res: Response) => {
  // We can get sessions from the Session table, but we also want to see sessions
  // that might only exist in audit logs (e.g. if they failed to create properly but logged something).
  // However, simpler to start with Session table and maybe valid AuditLogs.

  // Let's just query the Session table for now as it's the source of truth
  // and join with AuditLog to check if they have logs? 
  // Efficiently, we probably just want sessions.

  // The user wants to "browse sessions". 
  const sessions = await prisma.session.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 50, // Limit to recent 50 sessions
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: {
                select: { name: true, firstName: true, email: true }
              }
            }
          }
        }
      }
    }
  });

  res.json({
    success: true,
    data: sessions
  });
});

/**
 * Get audit logs for a specific session.
 */
export const getSessionLogs = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const logs = await prisma.auditLog.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
  });

  // Calculate total cost
  // Fallback to data.totalCost or data.cost if the top-level cost column is null
  // This ensures we capture costs even if the DB column wasn't populated (migration lag, etc)
  const totalCost = logs.reduce((sum, log) => {
    const dbCost = log.cost || 0;
    const dataCost = (log.data as any)?.totalCost || (log.data as any)?.cost || 0;
    return sum + (dbCost || dataCost);
  }, 0);

  // Fetch session details to get user info
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: { user: true }
          }
        }
      }
    }
  });

  res.json({
    success: true,
    data: {
      session,
      logs,
      summary: {
        totalCost,
        count: logs.length,
        startTime: logs[0]?.timestamp,
        endTime: logs[logs.length - 1]?.timestamp,
      }
    }
  });
});
