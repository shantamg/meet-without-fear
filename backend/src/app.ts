import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { requestContextMiddleware } from './middleware/request-context';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

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

// API routes - support both /api and /api/v1 for compatibility
app.use('/api/v1', routes);
app.use('/api', routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
});

export default app;
