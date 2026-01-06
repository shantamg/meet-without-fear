import path from 'path';
import fs from 'fs';
import winston from 'winston';
import Ably from 'ably';
import { AuditLogEntry, AuditSection } from '@meet-without-fear/shared';

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

export const auditLog = (section: AuditSection, message: string, data?: Record<string, any> & { turnId?: string }) => {
  const turnId = data?.turnId;
  const dataWithoutTurnId = data ? { ...data } : undefined;
  if (dataWithoutTurnId && 'turnId' in dataWithoutTurnId) {
    delete dataWithoutTurnId.turnId;
  }
  
  const logEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    section,
    message,
    turnId,
    data: dataWithoutTurnId,
  };

  // 1. Write to Disk (Sync/Fast)
  fileLogger.info({ message, section, ...data });

  // 2. Broadcast to Ably (Fire-and-Forget)
  // We do NOT await this promise. We catch errors to prevent backend crashes.
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
};
