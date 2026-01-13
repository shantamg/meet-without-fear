/**
 * Ably channel names and configuration constants.
 */

export const ABLY_CHANNELS = {
  AI_AUDIT_STREAM: 'ai-audit-stream',
} as const;

export const ABLY_EVENTS = {
  SESSION_CREATED: 'session-created',
  BRAIN_ACTIVITY: 'brain-activity',
  NEW_MESSAGE: 'new-message',
} as const;

export type AblyConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected';
