import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { successResponse, errorResponse } from '../utils/response';
import {
  createPassiveReentry,
  listTendingEntries,
  submitTendingResponse,
  TendingInvalidStateError,
  TendingNotFoundError,
} from '../services/tending.service';

const submitTendingResponseSchema = z.object({
  status: z.string().min(1).max(80),
  reflection: z.string().max(2000).optional(),
  continueChoice: z.string().max(80).optional(),
});

const createTendingReentrySchema = z.object({
  intent: z.string().max(1000).optional(),
});

export async function getTendingEntries(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const entries = await listTendingEntries(req.params.id, user.id);
    successResponse(res, { entries });
  } catch (error) {
    if (error instanceof TendingNotFoundError) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }
    logger.error('[getTendingEntries] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get Tending entries', 500);
  }
}

export async function postTendingResponse(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const parseResult = submitTendingResponseSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const entry = await submitTendingResponse({
      entryId: req.params.entryId,
      userId: user.id,
      ...parseResult.data,
    });
    successResponse(res, { entry });
  } catch (error) {
    if (error instanceof TendingNotFoundError) {
      errorResponse(res, 'NOT_FOUND', 'Tending entry not found', 404);
      return;
    }
    if (error instanceof TendingInvalidStateError) {
      errorResponse(res, 'VALIDATION_ERROR', error.message, 400);
      return;
    }
    logger.error('[postTendingResponse] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to submit Tending response', 500);
  }
}

export async function postTendingReentry(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const parseResult = createTendingReentrySchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const entry = await createPassiveReentry({
      sessionId: req.params.id,
      userId: user.id,
      intent: parseResult.data.intent,
    });
    successResponse(res, { entry }, 201);
  } catch (error) {
    if (error instanceof TendingNotFoundError) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }
    if (error instanceof TendingInvalidStateError) {
      errorResponse(res, 'VALIDATION_ERROR', error.message, 400);
      return;
    }
    logger.error('[postTendingReentry] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to create Tending re-entry', 500);
  }
}
