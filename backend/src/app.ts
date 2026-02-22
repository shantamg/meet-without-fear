import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import routes from './routes';
import { requestContextMiddleware } from './middleware/request-context';
import { errorHandler, notFoundHandler } from './middleware/errors';

const app = express();

// Security middleware
app.use(helmet());

// CORS - allow dashboard domain when configured, restrict to localhost in dev
const corsOrigins: (string | RegExp)[] = [];
if (process.env.DASHBOARD_URL) {
  corsOrigins.push(process.env.DASHBOARD_URL);
} else {
  // Default to localhost origins only — never allow '*' in production
  corsOrigins.push('http://localhost:5173', 'http://localhost:3000');
}
app.use(cors({ origin: corsOrigins }));

// Compression middleware - skip SSE endpoints to prevent buffering
app.use(
  compression({
    filter: (req, res) => {
      // Skip compression for SSE streaming endpoints
      if (req.path.includes('/messages/stream')) {
        return false;
      }
      // Use default compression filter for other requests
      return compression.filter(req, res);
    },
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request context - establishes AsyncLocalStorage context for turnId propagation
// Must be before routes but after body parsing
app.use(requestContextMiddleware);

// Request logging
app.use((req, res, next) => {
  const hasAuth = !!req.headers.authorization;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} (auth: ${hasAuth})`);

  // Log response status
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode}`);
  });
  next();
});

// Health check - must be before API routes (no auth required)
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes - support both /api and /api/v1 for compatibility
app.use('/api/v1', routes);
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler - handles AppError, ZodError, and unknown errors consistently
app.use(errorHandler);

export default app;
