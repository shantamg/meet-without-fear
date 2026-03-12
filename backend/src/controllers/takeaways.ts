/**
 * Takeaway CRUD Controller
 *
 * Handles per-takeaway operations for distilled Inner Thoughts sessions:
 * - GET /inner-thoughts/:id/takeaways     — List all takeaways for a session
 * - PATCH /inner-thoughts/:id/takeaways/:takeawayId — Update takeaway content
 * - DELETE /inner-thoughts/:id/takeaways/:takeawayId — Delete a takeaway
 *
 * These endpoints are consumed by the mobile TakeawayReviewSheet for inline
 * editing (DIST-05) and swipe-to-delete (DIST-06).
 */

import { Request, Response } from 'express';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errors';
import { getUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import type {
  ApiResponse,
  GetTakeawaysResponse,
  UpdateTakeawayResponse,
  DeleteTakeawayResponse,
  TakeawayDTO,
} from '@meet-without-fear/shared';

// ============================================================================
// Helper
// ============================================================================

function mapTakeawayToDTO(t: {
  id: string;
  content: string;
  theme: string | null;
  source: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): TakeawayDTO {
  return {
    id: t.id,
    content: t.content,
    theme: t.theme,
    source: t.source as 'AI' | 'USER',
    position: t.position,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// ============================================================================
// GET /inner-thoughts/:id/takeaways
// ============================================================================

/**
 * List all takeaways for a session.
 *
 * Returns the takeaway list and the session's `distilledAt` timestamp.
 * Returns an empty array (not 404) when no takeaways exist.
 */
export const getTakeaways = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const sessionId = req.params.id;

    // Verify the session exists and belongs to the user
    const session = await (prisma as any).innerWorkSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true, distilledAt: true },
    });
    if (!session) throw new NotFoundError('Session not found');

    const rawTakeaways = await (prisma as any).sessionTakeaway.findMany({
      where: { sessionId },
      orderBy: { position: 'asc' },
    });

    const response: ApiResponse<GetTakeawaysResponse> = {
      success: true,
      data: {
        takeaways: rawTakeaways.map(mapTakeawayToDTO),
        distilledAt: session.distilledAt?.toISOString() ?? null,
      },
    };
    res.json(response);
  }
);

// ============================================================================
// PATCH /inner-thoughts/:id/takeaways/:takeawayId
// ============================================================================

/**
 * Update a takeaway's content.
 *
 * Changes the source from 'AI' to 'USER' to mark it as user-edited.
 * USER-sourced takeaways are preserved during re-distillation.
 */
export const updateTakeaway = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const { id: sessionId, takeawayId } = req.params;
    const { content } = req.body as { content?: string };

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('content is required and must be a non-empty string');
    }

    // Verify the session exists and belongs to the user
    const session = await (prisma as any).innerWorkSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true },
    });
    if (!session) throw new NotFoundError('Session not found');

    // Verify the takeaway belongs to this session
    const existing = await (prisma as any).sessionTakeaway.findFirst({
      where: { id: takeawayId, sessionId },
    });
    if (!existing) throw new NotFoundError('Takeaway not found');

    const updated = await (prisma as any).sessionTakeaway.update({
      where: { id: takeawayId },
      data: {
        content: content.trim(),
        source: 'USER', // Mark as user-edited to preserve on re-distillation
      },
    });

    const response: ApiResponse<UpdateTakeawayResponse> = {
      success: true,
      data: { takeaway: mapTakeawayToDTO(updated) },
    };
    res.json(response);
  }
);

// ============================================================================
// DELETE /inner-thoughts/:id/takeaways/:takeawayId
// ============================================================================

/**
 * Delete a single takeaway.
 *
 * Permanently removes the takeaway. Cannot be undone.
 */
export const deleteTakeaway = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const { id: sessionId, takeawayId } = req.params;

    // Verify the session exists and belongs to the user
    const session = await (prisma as any).innerWorkSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true },
    });
    if (!session) throw new NotFoundError('Session not found');

    // Verify the takeaway belongs to this session
    const existing = await (prisma as any).sessionTakeaway.findFirst({
      where: { id: takeawayId, sessionId },
    });
    if (!existing) throw new NotFoundError('Takeaway not found');

    await (prisma as any).sessionTakeaway.delete({
      where: { id: takeawayId },
    });

    const response: ApiResponse<DeleteTakeawayResponse> = {
      success: true,
      data: { success: true },
    };
    res.json(response);
  }
);
