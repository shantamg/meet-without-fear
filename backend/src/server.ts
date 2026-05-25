import 'dotenv/config';
import * as Sentry from '@sentry/node';

/** Keys that may contain user names / PII — strip from Sentry context. */
const PII_KEYS = new Set([
  'name', 'firstName', 'guesser', 'subject',
  'guesserName', 'subjectName', 'partnerName',
  'userName', 'userAName', 'userBName',
  'email', 'clerkId', 'content', 'conversationSummary',
]);

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 1.0,
  enabled: !!process.env.SENTRY_DSN,
  beforeSend(event) {
    // Drop development environment events to prevent local dev noise in Sentry
    if (event.environment === 'development') return null;

    // Strip PII from extra context (defense-in-depth)
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (PII_KEYS.has(key)) {
          delete event.extra[key];
        }
      }
    }
    // Strip PII from breadcrumb data
    if (event.breadcrumbs) {
      for (const breadcrumb of event.breadcrumbs) {
        if (breadcrumb.data) {
          for (const key of Object.keys(breadcrumb.data)) {
            if (PII_KEYS.has(key)) {
              delete breadcrumb.data[key];
            }
          }
        }
      }
    }
    // Strip Sentry's automatic user context (can contain email, id, ip)
    if (event.contexts?.user) {
      delete event.contexts.user;
    }
    return event;
  },
});

import { createServer } from 'http';
import app from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { attachRealtimeWebSocket } from './services/realtime-transcription';

// Fail fast: E2E_AUTH_BYPASS must never be enabled in production
if (process.env.E2E_AUTH_BYPASS === 'true' && process.env.NODE_ENV === 'production') {
  throw new Error(
    'FATAL: E2E_AUTH_BYPASS=true is set in a production environment. ' +
    'This disables all authentication and security controls. ' +
    'Remove E2E_AUTH_BYPASS from the production environment variables.'
  );
}

// Fail fast: FIELD_ENCRYPTION_KEY is required in production
if (!process.env.FIELD_ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  throw new Error(
    'FATAL: FIELD_ENCRYPTION_KEY is not set in a production environment. ' +
    'All sensitive fields (messages, empathy drafts, conversation summaries) would be stored as plaintext. ' +
    'Generate a key with: openssl rand -base64 32'
  );
}

const PORT = process.env.PORT || 3000;

// Create HTTP server from Express app (required for WebSocket upgrade handling)
const server = createServer(app);

// Attach /realtime WebSocket endpoint for real-time transcription
attachRealtimeWebSocket(server);

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    logger.info('HTTP server closed');
    await prisma.$disconnect();
    await Sentry.close(2000);
    process.exit(0);
  });

  // Force exit after 10 s if connections don't drain
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
