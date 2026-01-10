import path from 'path';
import fs from 'fs';
import winston from 'winston';
import Ably from 'ably';
import { AuditLogEntry, AuditSection } from '@meet-without-fear/shared';
import { getCurrentTurnId, getCurrentSessionId, getCurrentUserId } from '../lib/request-context';

// Ensure logs directory exists for file transport
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Lazy-initialized Ably Rest client (same pattern as realtime.ts)
let ablyClient: Ably.Rest | undefined;

function getAblyClient(): Ably.Rest | null {
  if (!process.env.ABLY_API_KEY) {
    return null;
  }
  if (!ablyClient) {
    ablyClient = new Ably.Rest(process.env.ABLY_API_KEY);
  }
  return ablyClient;
}

// File Logger (Permanent Record)
const fileLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'ai-audit.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

import { prisma } from '../lib/prisma';

export const auditLog = async (section: AuditSection, message: string, data?: Record<string, any> & { turnId?: string }) => {
  // Get turnId from explicit parameter, or fall back to request context
  const explicitTurnId = data?.turnId;
  const contextTurnId = getCurrentTurnId(data?.sessionId);
  const turnId = explicitTurnId || contextTurnId;

  // Get userId from request context if not in data
  const userId = data?.userId || getCurrentUserId();

  const dataWithoutTurnId: Record<string, any> = data ? { ...data, userId } : { userId };
  if ('turnId' in dataWithoutTurnId) {
    delete dataWithoutTurnId.turnId;
  }

  // Ensure we don't pass undefined/null as data to Prisma (it expects Json or InputJsonValue)
  // And strip undefined values which might cause issues in some environments
  Object.keys(dataWithoutTurnId).forEach(key => {
    if (dataWithoutTurnId[key] === undefined) {
      delete dataWithoutTurnId[key];
    }
  });

  // Extract sessionId from data or request context
  const sessionId = data?.sessionId || data?.data?.sessionId || getCurrentSessionId();

  // Extract cost if available in COST section
  let cost: number | undefined;
  if (section === 'COST' && data?.totalCost) {
    cost = data.totalCost;
  }

  const logEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    section,
    message,
    turnId,
    data: dataWithoutTurnId,
    cost,
    sessionId,
  };

  if (process.env.NODE_ENV === 'development') {
    // console.log('[AuditLogger] Processing log:', { section, message, sessionId, turnId, dataKeys: Object.keys(dataWithoutTurnId || {}) });
  }

  // 1. Write to Disk (Sync/Fast - via Winston which handles async internally)
  fileLogger.info({ message, section, ...data });

  // 2. Broadcast to Ably (Fire-and-Forget)
  if (process.env.ENABLE_AUDIT_STREAM === 'true') {
    const ably = getAblyClient();
    if (ably) {
      const channel = ably.channels.get('ai-audit-stream');
      channel.publish('log', logEntry).catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[AuditLogger] Telemetry push failed:', err.message);
        }
      });
    }
  }

  // 3. Persist to Database (Fire-and-Forget)
  try {
    // We don't await the create to return immediately, but we catch errors
    prisma.auditLog.create({
      data: {
        section,
        message,
        turnId,
        sessionId,
        data: dataWithoutTurnId || {},
        cost,
      },
    }).catch((err) => {
      console.error('[AuditLogger] DB persist failed:', err.message);
      getAblyClient()?.channels.get('ai-audit-stream').publish('log', {
        timestamp: new Date().toISOString(),
        section: 'ERROR',
        message: `DB Persist Failed: ${err.message}`,
        data: { error: err.toString() }
      }).catch(() => { });
    });
  } catch (err) {
    console.error('[AuditLogger] Unexpected error during persist:', err);
    getAblyClient()?.channels.get('ai-audit-stream').publish('log', {
      timestamp: new Date().toISOString(),
      section: 'ERROR',
      message: `Unexpected Error: ${err instanceof Error ? err.message : String(err)}`,
      data: { error: String(err) }
    }).catch(() => { });
  }
};
