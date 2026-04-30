import 'dotenv/config';
import * as Sentry from '@sentry/node';

/** Keys that may contain user names / PII — strip from Sentry context. */
const PII_KEYS = new Set([
  'name', 'firstName', 'guesser', 'subject',
  'guesserName', 'subjectName', 'partnerName',
  'userName', 'userAName', 'userBName',
]);

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 1.0,
  enabled: !!process.env.SENTRY_DSN,
  beforeSend(event) {
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
    return event;
  },
});

import { createServer } from 'http';
import app from './app';
import { logger } from './lib/logger';
import { attachRealtimeWebSocket } from './services/realtime-transcription';

// Fail fast: E2E_AUTH_BYPASS must never be enabled in production
if (process.env.E2E_AUTH_BYPASS === 'true' && process.env.NODE_ENV === 'production') {
  throw new Error(
    'FATAL: E2E_AUTH_BYPASS=true is set in a production environment. ' +
    'This disables all authentication and security controls. ' +
    'Remove E2E_AUTH_BYPASS from the production environment variables.'
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
