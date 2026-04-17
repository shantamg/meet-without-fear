/**
 * Slack MWF Session Controller
 *
 * Entry point for messages originating from Slack. The EC2 socket listener
 * POSTs incoming DM/lobby messages here; the backend orchestrates the full
 * Bedrock pipeline (same engine as the mobile app) and posts the reply back
 * to Slack via `slack-client`.
 *
 * Phase 1 scope (this file): validate shared-secret, ack the payload, and
 * echo the message back to the same thread so end-to-end plumbing can be
 * smoke-tested. Phases 3–4 replace the echo with the real session loop.
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { handleSlackMessage } from '../services/slack-session-orchestrator';
import type { SlackMessagePayload } from '../services/slack-types';
import { getWorkspaceStatus } from '../services/workspace-prompt-builder';

export type { SlackMessagePayload };

/**
 * Validate the shared secret passed by the socket listener. Prevents random
 * callers from posting arbitrary Slack messages through us.
 */
function validateSharedSecret(req: Request): boolean {
  const expected = process.env.SLACK_INGRESS_SECRET;
  if (!expected) {
    // Dev fallback: allow when no secret is configured so local testing works.
    if (process.env.NODE_ENV === 'production') {
      logger.error('[SlackSession] SLACK_INGRESS_SECRET missing in production — rejecting');
      return false;
    }
    return true;
  }

  const provided = req.header('x-slack-ingress-secret') ?? '';

  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * POST /api/slack/mwf-session
 *
 * Accepts a Slack message payload, 200s immediately, then processes the
 * conversation turn asynchronously so the socket listener can move on.
 */
export async function handleMwfSessionMessage(req: Request, res: Response): Promise<void> {
  if (!validateSharedSecret(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const payload = req.body as SlackMessagePayload;

  if (!payload || !payload.channel || !payload.user || typeof payload.text !== 'string' || !payload.ts) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  logger.info(
    `[SlackSession] Accepted message channel=${payload.channel} user=${payload.user} ts=${payload.ts} lobby=${payload.isLobby ?? false}`
  );

  res.status(200).json({ ok: true });

  // Process in the background — do not block the socket listener.
  handleSlackMessage(payload).catch((err: unknown) => {
    logger.error('[SlackSession] handleSlackMessage failed:', err);
  });
}

/**
 * GET /api/slack/health — lightweight diag endpoint so the socket listener
 * can verify the backend is reachable before wiring itself up.
 */
export function slackHealth(_req: Request, res: Response): void {
  const workspace = getWorkspaceStatus();
  res.status(200).json({
    ok: true,
    slackConfigured: Boolean(process.env.SLACK_BOT_TOKEN),
    secretRequired: Boolean(process.env.SLACK_INGRESS_SECRET),
    workspace: {
      root: workspace.root,
      stagesLoaded: workspace.stagesLoaded,
      guardianLoaded: workspace.guardianLoaded,
      privacyLoaded: workspace.privacyLoaded,
      progressionLoaded: workspace.progressionLoaded,
    },
  });
}
