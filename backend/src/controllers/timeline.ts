/**
 * Timeline Controller
 *
 * Handles the unified timeline endpoint that returns all chat items
 * (messages, indicators, emotion changes) in a single response.
 *
 * GET /sessions/:id/timeline
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { aggregateTimeline } from '../services/timeline-aggregator';
import { successResponse, errorResponse } from '../utils/response';

// ============================================================================
// Request Validation
// ============================================================================

const getTimelineQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ============================================================================
// Controller
// ============================================================================

/**
 * Get unified timeline for a session
 *
 * GET /sessions/:id/timeline
 *
 * Query params:
 * - before: ISO timestamp cursor (return items before this time)
 * - limit: Maximum number of message items (default 20, max 100)
 *
 * Response:
 * - items: ChatItem[] sorted by timestamp descending
 * - hasMore: boolean indicating if more items exist before oldest
 */
export async function getTimeline(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate query params
    const parseResult = getTimelineQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { before, limit } = parseResult.data;

    // Aggregate timeline items
    const timeline = await aggregateTimeline({
      sessionId,
      userId: user.id,
      before,
      limit,
    });

    successResponse(res, timeline);
  } catch (error) {
    console.error('[getTimeline] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get timeline', 500);
  }
}
