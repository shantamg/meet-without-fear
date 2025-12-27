import { Router } from 'express';
import authRoutes from './auth';
import emotionsRoutes from './emotions';
import stage0Routes from './stage0';
import stage1Routes from './stage1';

const router = Router();

// Mount all route modules
router.use('/auth', authRoutes);
router.use(emotionsRoutes);
router.use(stage0Routes);
router.use(stage1Routes);

// Health check endpoint
router.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
