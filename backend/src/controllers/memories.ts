/**
 * Memories Controller (Things to Always Remember)
 *
 * Handles persistent memory operations:
 * - GET /memories - List all user memories grouped by global/session
 * - POST /memories - Create new memory with validation
 * - PUT /memories/:id - Update existing memory
 * - DELETE /memories/:id - Delete memory
 * - POST /memories/approve - Approve AI suggestion
 * - POST /memories/reject - Reject AI suggestion (for analytics)
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getUser } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errors';
import {
  ApiResponse,
  UserMemoryDTO,
  CreateMemoryRequest,
  UpdateMemoryRequest,
  ApproveMemoryRequest,
  RejectMemoryRequest,
  ListMemoriesResponse,
  MemoryCategory,
  MemorySource,
  FormatMemoryRequest,
  FormatMemoryResponse,
  UpdateMemoryAIRequest,
  UpdateMemoryAIResponse,
  ConfirmMemoryRequest,
  ConfirmMemoryUpdateRequest,
} from '@meet-without-fear/shared';
import { validateMemory } from '../services/memory-validator';
import { formatMemoryRequest, processMemoryUpdate } from '../services/memory-formatter';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map Prisma UserMemory to DTO
 */
function mapMemoryToDTO(
  memory: {
    id: string;
    content: string;
    category: string;
    status: string;
    source: string;
    sessionId: string | null;
    suggestedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  sessionPartnerName?: string
): UserMemoryDTO {
  return {
    id: memory.id,
    content: memory.content,
    category: memory.category as MemoryCategory,
    status: memory.status as 'ACTIVE' | 'REJECTED',
    source: memory.source as MemorySource,
    scope: memory.sessionId ? 'session' : 'global',
    sessionId: memory.sessionId || undefined,
    sessionPartnerName,
    suggestedBy: memory.suggestedBy || undefined,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

/**
 * Get partner name for a session-scoped memory
 */
async function getSessionPartnerName(
  sessionId: string,
  userId: string
): Promise<string | undefined> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        relationship: {
          include: {
            members: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (!session) return undefined;

    const partner = session.relationship.members.find((m) => m.userId !== userId);
    return partner?.nickname || partner?.user?.firstName || partner?.user?.name || undefined;
  } catch {
    return undefined;
  }
}

// ============================================================================
// GET /memories - List all user memories
// ============================================================================

export const listMemories = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);

    // Fetch all active memories for the user
    const memories = await prisma.userMemory.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Separate global and session memories
    const global: UserMemoryDTO[] = [];
    const session: Record<string, UserMemoryDTO[]> = {};

    // Get partner names for session-scoped memories
    const sessionIds = new Set(
      memories
        .filter((m) => m.sessionId)
        .map((m) => m.sessionId as string)
    );

    const partnerNames: Record<string, string | undefined> = {};
    for (const sessionId of sessionIds) {
      partnerNames[sessionId] = await getSessionPartnerName(sessionId, user.id);
    }

    for (const memory of memories) {
      const dto = mapMemoryToDTO(
        memory,
        memory.sessionId ? partnerNames[memory.sessionId] : undefined
      );

      if (memory.sessionId) {
        if (!session[memory.sessionId]) {
          session[memory.sessionId] = [];
        }
        session[memory.sessionId].push(dto);
      } else {
        global.push(dto);
      }
    }

    const response: ApiResponse<ListMemoriesResponse> = {
      success: true,
      data: { global, session },
    };

    res.json(response);
  }
);

// ============================================================================
// POST /memories - Create new memory
// ============================================================================

export const createMemory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const body = req.body as CreateMemoryRequest;

    // Validate request
    if (!body.content || typeof body.content !== 'string') {
      throw new ValidationError('Memory content is required');
    }
    if (!body.category) {
      throw new ValidationError('Memory category is required');
    }

    // Validate memory content
    const validationResult = validateMemory(body.content, body.category);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.reason || 'Memory validation failed');
    }

    // If session-scoped, verify user has access to the session
    if (body.sessionId) {
      const session = await prisma.session.findFirst({
        where: {
          id: body.sessionId,
          relationship: {
            members: {
              some: { userId: user.id },
            },
          },
        },
      });

      if (!session) {
        throw new ValidationError('Session not found or access denied');
      }
    }

    // Create the memory
    const memory = await prisma.userMemory.create({
      data: {
        userId: user.id,
        content: body.content.trim(),
        category: body.category,
        sessionId: body.sessionId || null,
        source: 'USER_CREATED',
        status: 'ACTIVE',
      },
    });

    const partnerName = body.sessionId
      ? await getSessionPartnerName(body.sessionId, user.id)
      : undefined;

    const response: ApiResponse<{ memory: UserMemoryDTO }> = {
      success: true,
      data: { memory: mapMemoryToDTO(memory, partnerName) },
    };

    res.status(201).json(response);
  }
);

// ============================================================================
// PUT /memories/:id - Update memory
// ============================================================================

export const updateMemory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const memoryId = req.params.id;
    const body = req.body as UpdateMemoryRequest;

    // Verify memory exists and belongs to user
    const existing = await prisma.userMemory.findFirst({
      where: {
        id: memoryId,
        userId: user.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Memory');
    }

    // Validate new content if provided
    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length === 0) {
        throw new ValidationError('Memory content cannot be empty');
      }

      const validationResult = validateMemory(body.content, existing.category);
      if (!validationResult.valid) {
        throw new ValidationError(validationResult.reason || 'Memory validation failed');
      }
    }

    // Update the memory
    const memory = await prisma.userMemory.update({
      where: { id: memoryId },
      data: {
        content: body.content !== undefined ? body.content.trim() : undefined,
        status: body.status,
        updatedAt: new Date(),
      },
    });

    const partnerName = memory.sessionId
      ? await getSessionPartnerName(memory.sessionId, user.id)
      : undefined;

    const response: ApiResponse<{ memory: UserMemoryDTO }> = {
      success: true,
      data: { memory: mapMemoryToDTO(memory, partnerName) },
    };

    res.json(response);
  }
);

// ============================================================================
// DELETE /memories/:id - Delete memory
// ============================================================================

export const deleteMemory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const memoryId = req.params.id;

    // Verify memory exists and belongs to user
    const existing = await prisma.userMemory.findFirst({
      where: {
        id: memoryId,
        userId: user.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Memory');
    }

    // Delete the memory
    await prisma.userMemory.delete({
      where: { id: memoryId },
    });

    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
    };

    res.json(response);
  }
);

// ============================================================================
// POST /memories/approve - Approve AI suggestion
// ============================================================================

export const approveMemory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const body = req.body as ApproveMemoryRequest;

    // Validate request
    if (!body.suggestedContent || typeof body.suggestedContent !== 'string') {
      throw new ValidationError('Suggested content is required');
    }
    if (!body.category) {
      throw new ValidationError('Category is required');
    }

    // Determine final content (user may have edited)
    const finalContent = body.editedContent?.trim() || body.suggestedContent.trim();
    const wasEdited = body.editedContent !== undefined && body.editedContent !== body.suggestedContent;

    // Validate the final content
    const validationResult = validateMemory(finalContent, body.category);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.reason || 'Memory validation failed');
    }

    // If session-scoped, verify user has access
    if (body.sessionId) {
      const session = await prisma.session.findFirst({
        where: {
          id: body.sessionId,
          relationship: {
            members: {
              some: { userId: user.id },
            },
          },
        },
      });

      if (!session) {
        throw new ValidationError('Session not found or access denied');
      }
    }

    // Check for duplicate content (prevent approving same suggestion twice)
    const existingDuplicate = await prisma.userMemory.findFirst({
      where: {
        userId: user.id,
        content: finalContent,
        sessionId: body.sessionId || null,
        status: 'ACTIVE',
      },
    });

    if (existingDuplicate) {
      throw new ValidationError('A memory with this content already exists');
    }

    // Create the approved memory
    const memory = await prisma.userMemory.create({
      data: {
        userId: user.id,
        content: finalContent,
        category: body.category,
        sessionId: body.sessionId || null,
        source: wasEdited ? 'USER_EDITED' : 'USER_APPROVED',
        suggestedBy: wasEdited ? body.suggestedContent : null,
        status: 'ACTIVE',
      },
    });

    const partnerName = body.sessionId
      ? await getSessionPartnerName(body.sessionId, user.id)
      : undefined;

    const response: ApiResponse<{ memory: UserMemoryDTO }> = {
      success: true,
      data: { memory: mapMemoryToDTO(memory, partnerName) },
    };

    res.status(201).json(response);
  }
);

// ============================================================================
// POST /memories/reject - Reject AI suggestion (for analytics)
// ============================================================================

export const rejectMemory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const body = req.body as RejectMemoryRequest;

    // Validate request
    if (!body.suggestedContent || typeof body.suggestedContent !== 'string') {
      throw new ValidationError('Suggested content is required');
    }
    if (!body.category) {
      throw new ValidationError('Category is required');
    }

    // Store rejection for analytics (helps improve AI suggestions)
    // We create a rejected memory entry to track what users don't want
    await prisma.userMemory.create({
      data: {
        userId: user.id,
        content: body.suggestedContent.trim(),
        category: body.category,
        source: 'USER_APPROVED', // Will be marked as rejected
        status: 'REJECTED',
      },
    });

    const response: ApiResponse<{ rejected: boolean }> = {
      success: true,
      data: { rejected: true },
    };

    res.json(response);
  }
);

// ============================================================================
// POST /memories/format - AI-assisted memory creation (preview)
// ============================================================================

export const formatMemory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const body = req.body as FormatMemoryRequest;

    // Validate request
    if (!body.userInput || typeof body.userInput !== 'string') {
      throw new ValidationError('User input is required');
    }

    // If session-scoped, verify user has access
    if (body.sessionId) {
      const session = await prisma.session.findFirst({
        where: {
          id: body.sessionId,
          relationship: {
            members: {
              some: { userId: user.id },
            },
          },
        },
      });

      if (!session) {
        throw new ValidationError('Session not found or access denied');
      }
    }

    // Process through AI formatter
    const result = await formatMemoryRequest(body.userInput, body.sessionId);

    const response: ApiResponse<FormatMemoryResponse> = {
      success: true,
      data: result,
    };

    res.json(response);
  }
);

// ============================================================================
// POST /memories/confirm - Save AI-formatted memory
// ============================================================================

export const confirmMemory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const body = req.body as ConfirmMemoryRequest;

    // Validate request
    if (!body.content || typeof body.content !== 'string') {
      throw new ValidationError('Memory content is required');
    }
    if (!body.category) {
      throw new ValidationError('Category is required');
    }

    // Final validation (in case user manipulated the request)
    const validationResult = validateMemory(body.content, body.category);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.reason || 'Memory validation failed');
    }

    // If session-scoped, verify user has access
    if (body.sessionId) {
      const session = await prisma.session.findFirst({
        where: {
          id: body.sessionId,
          relationship: {
            members: {
              some: { userId: user.id },
            },
          },
        },
      });

      if (!session) {
        throw new ValidationError('Session not found or access denied');
      }
    }

    // Check for duplicate
    const existingDuplicate = await prisma.userMemory.findFirst({
      where: {
        userId: user.id,
        content: body.content.trim(),
        sessionId: body.sessionId || null,
        status: 'ACTIVE',
      },
    });

    if (existingDuplicate) {
      throw new ValidationError('A memory with this content already exists');
    }

    // Create the memory
    const memory = await prisma.userMemory.create({
      data: {
        userId: user.id,
        content: body.content.trim(),
        category: body.category,
        sessionId: body.sessionId || null,
        source: 'USER_CREATED',
        status: 'ACTIVE',
      },
    });

    const partnerName = body.sessionId
      ? await getSessionPartnerName(body.sessionId, user.id)
      : undefined;

    const response: ApiResponse<{ memory: UserMemoryDTO }> = {
      success: true,
      data: { memory: mapMemoryToDTO(memory, partnerName) },
    };

    res.status(201).json(response);
  }
);

// ============================================================================
// POST /memories/:id/update - AI-assisted memory update (preview)
// ============================================================================

export const updateMemoryAI = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const memoryId = req.params.id;
    const body = req.body as { changeRequest: string };

    // Validate request
    if (!body.changeRequest || typeof body.changeRequest !== 'string') {
      throw new ValidationError('Change request is required');
    }

    // Verify memory exists and belongs to user
    const existing = await prisma.userMemory.findFirst({
      where: {
        id: memoryId,
        userId: user.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Memory');
    }

    // Process through AI formatter
    const result = await processMemoryUpdate(
      existing.content,
      existing.category as MemoryCategory,
      body.changeRequest
    );

    const response: ApiResponse<UpdateMemoryAIResponse> = {
      success: true,
      data: result,
    };

    res.json(response);
  }
);

// ============================================================================
// POST /memories/:id/confirm-update - Save AI-updated memory
// ============================================================================

export const confirmMemoryUpdate = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = getUser(req);
    const memoryId = req.params.id;
    const body = req.body as ConfirmMemoryUpdateRequest;

    // Validate request
    if (!body.content || typeof body.content !== 'string') {
      throw new ValidationError('Memory content is required');
    }
    if (!body.category) {
      throw new ValidationError('Category is required');
    }

    // Verify memory exists and belongs to user
    const existing = await prisma.userMemory.findFirst({
      where: {
        id: memoryId,
        userId: user.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Memory');
    }

    // Final validation
    const validationResult = validateMemory(body.content, body.category);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.reason || 'Memory validation failed');
    }

    // Update the memory
    const memory = await prisma.userMemory.update({
      where: { id: memoryId },
      data: {
        content: body.content.trim(),
        category: body.category,
        source: 'USER_EDITED',
        suggestedBy: existing.content, // Store original for reference
        updatedAt: new Date(),
      },
    });

    const partnerName = memory.sessionId
      ? await getSessionPartnerName(memory.sessionId, user.id)
      : undefined;

    const response: ApiResponse<{ memory: UserMemoryDTO }> = {
      success: true,
      data: { memory: mapMemoryToDTO(memory, partnerName) },
    };

    res.json(response);
  }
);
