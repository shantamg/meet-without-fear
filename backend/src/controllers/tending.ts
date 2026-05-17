import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { successResponse, errorResponse } from '../utils/response';
import {
  createPassiveReentry,
  listTendingEntries,
  setIndividualEntryShare,
  submitTendingCheckin,
  submitTendingResponse,
  TendingForbiddenError,
  TendingInvalidStateError,
  TendingNotFoundError,
} from '../services/tending.service';
import { ContinueChoice, PartialClosureResolution } from '@meet-without-fear/shared';

const submitTendingResponseSchema = z.object({
  status: z.string().min(1).max(80),
  reflection: z.string().max(2000).optional(),
  continueChoice: z.nativeEnum(ContinueChoice).optional(),
});

const orientationSchema = z.object({
  reflection: z.string().max(4000).default(''),
  perEntryNotes: z.record(z.string(), z.string().max(2000)).optional(),
});

const submitTendingCheckinSchema = z.object({
  orientations: z.object({
    whatWorked: orientationSchema,
    whereMoreSupport: orientationSchema,
    whatComesNext: z.object({
      continueChoice: z.nativeEnum(ContinueChoice),
      partialClosure: z.record(z.string(), z.nativeEnum(PartialClosureResolution)).optional(),
    }),
  }),
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

async function handleShareToggle(req: Request, res: Response, optedInShared: boolean): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const entry = await setIndividualEntryShare({
      entryId: req.params.entryId,
      userId: user.id,
      optedInShared,
    });
    successResponse(res, { entry });
  } catch (error) {
    if (error instanceof TendingNotFoundError) {
      errorResponse(res, 'NOT_FOUND', 'Tending entry not found', 404);
      return;
    }
    if (error instanceof TendingForbiddenError) {
      errorResponse(res, 'FORBIDDEN', 'Only the owner can change sharing on this entry', 403);
      return;
    }
    if (error instanceof TendingInvalidStateError) {
      errorResponse(res, 'VALIDATION_ERROR', error.message, 400);
      return;
    }
    logger.error('[handleShareToggle] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to update Tending entry sharing', 500);
  }
}

export async function postTendingEntryShare(req: Request, res: Response): Promise<void> {
  await handleShareToggle(req, res, true);
}

export async function postTendingEntryUnshare(req: Request, res: Response): Promise<void> {
  await handleShareToggle(req, res, false);
}

export async function postTendingCheckin(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const parseResult = submitTendingCheckinSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const result = await submitTendingCheckin({
      sessionId: req.params.id,
      userId: user.id,
      orientations: parseResult.data.orientations,
    });
    successResponse(res, {
      entries: result.entries,
      newSessionId: result.newSessionId,
      continueChoice: result.continueChoice,
      nextScheduledFor: result.nextScheduledFor ? result.nextScheduledFor.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof TendingNotFoundError) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }
    if (error instanceof TendingInvalidStateError) {
      errorResponse(res, 'VALIDATION_ERROR', error.message, 400);
      return;
    }
    logger.error('[postTendingCheckin] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to submit Tending check-in', 500);
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
