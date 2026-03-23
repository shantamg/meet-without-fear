import 'dotenv/config';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 1.0,
  enabled: !!process.env.SENTRY_DSN,
});

import { createServer } from 'http';
import app from './app';
import { logger } from './lib/logger';
import { attachRealtimeWebSocket } from './services/realtime-transcription';

const PORT = process.env.PORT || 3000;

// Create HTTP server from Express app (required for WebSocket upgrade handling)
const server = createServer(app);

// Attach /realtime WebSocket endpoint for real-time transcription
attachRealtimeWebSocket(server);

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
