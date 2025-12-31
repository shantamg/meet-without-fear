/**
 * Message Validation Schemas
 *
 * Zod schemas for message-related endpoints.
 * Note: Comprehensive message contracts are in contracts/sessions.ts
 */

import { z } from 'zod';
import { MessageRole } from '../enums';

// Re-export from contracts
export {
  sendMessageRequestSchema,
  sendMessageResponseSchema,
  messageSchema,
  type SendMessageRequestInput,
  type SendMessageResponseInput,
} from '../contracts/sessions';

// ============================================================================
// Get Messages (validation-specific)
// ============================================================================

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  before: z.string().optional(),
  after: z.string().optional(),
  /** Order by timestamp: 'asc' (oldest first) or 'desc' (newest first, for initial load) */
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type GetMessagesQueryInput = z.infer<typeof getMessagesQuerySchema>;

export const messageResponseSchema = z.object({
  id: z.string(),
  content: z.string(),
  role: z.nativeEnum(MessageRole),
  createdAt: z.string().datetime(),
});

export type MessageResponseInput = z.infer<typeof messageResponseSchema>;

export const getMessagesResponseSchema = z.object({
  messages: z.array(messageResponseSchema),
  hasMore: z.boolean(),
});

export type GetMessagesResponseInput = z.infer<typeof getMessagesResponseSchema>;
