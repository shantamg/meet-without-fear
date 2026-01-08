import { Router } from 'express';
import auditRoutes from './audit';
import authRoutes from './auth';
import chatRoutes from './chat';
import consentRoutes from './consent';
import emotionsRoutes from './emotions';
import gratitudeRoutes from './gratitude';
import innerThoughtsRoutes from './inner-thoughts';
import invitationsRoutes from './invitations';
import meditationRoutes from './meditation';
import memoriesRoutes from './memories';
import needsAssessmentRoutes from './needs-assessment';
import peopleRoutes from './people';
import notificationsRoutes from './notifications';
import reconcilerRoutes from './reconciler';
import sessionsRoutes from './sessions';
import stage0Routes from './stage0';
import stage1Routes from './stage1';
import stage2Routes from './stage2';
import stage3Routes from './stage3';
import stage4Routes from './stage4';
import ttsRoutes from './tts';

const router = Router();

console.log('[Routes] Loading main router...');

// Mount all route modules
router.use('/audit', auditRoutes);
router.use('/auth', authRoutes);
router.use('/tts', ttsRoutes);
router.use(chatRoutes); // Unified chat router
router.use(invitationsRoutes); // Must be before innerWorkRoutes (has public endpoints)
router.use(innerThoughtsRoutes); // Inner Thoughts (solo self-reflection, optionally linked to partner sessions)
router.use('/memories', memoriesRoutes); // Things to Always Remember
router.use('/needs', needsAssessmentRoutes); // Inner Work: Needs Assessment
router.use('/gratitude', gratitudeRoutes); // Inner Work: Gratitude Practice
router.use('/meditation', meditationRoutes); // Inner Work: Meditation
router.use('/people', peopleRoutes); // Inner Work: People Tracking
router.use(notificationsRoutes); // In-app notifications
router.use(sessionsRoutes);
router.use(consentRoutes);
router.use(emotionsRoutes);
router.use(stage0Routes);
router.use(stage1Routes);
router.use(stage2Routes);
router.use(reconcilerRoutes); // Post-Stage 2 empathy gap analysis
router.use(stage3Routes);
router.use(stage4Routes);

// Health check endpoint
router.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
