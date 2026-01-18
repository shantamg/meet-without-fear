/**
 * Chat Item DTOs
 *
 * Unified type system for chat timeline items. Each item has a distinct type,
 * corresponding data structure, and will be rendered by a specific component.
 *
 * This implements the Type Registry pattern where:
 * 1. All timeline items conform to a base interface with type discrimination
 * 2. A central registry maps type strings to React components
 * 3. Both backend and mobile use these shared types
 */

import { SharedContentDeliveryStatus } from './empathy';

// ============================================================================
// Chat Item Type Enumeration
// ============================================================================

/**
 * All possible chat item types. This enum enables exhaustive type checking
 * and serves as the discriminator for the ChatItem union type.
 */
export const ChatItemType = {
  AI_MESSAGE: 'ai-message',
  USER_MESSAGE: 'user-message',
  EMPATHY_STATEMENT: 'empathy-statement',
  SHARED_CONTEXT: 'shared-context',
  SHARE_SUGGESTION: 'share-suggestion',
  SYSTEM_MESSAGE: 'system-message',
  INDICATOR: 'indicator',
  EMOTION_CHANGE: 'emotion-change',
} as const;

export type ChatItemType = (typeof ChatItemType)[keyof typeof ChatItemType];

// ============================================================================
// Indicator Type Enumeration
// ============================================================================

/**
 * Types of timeline indicators that mark significant events/milestones.
 */
export const IndicatorType = {
  INVITATION_SENT: 'invitation-sent',
  INVITATION_ACCEPTED: 'invitation-accepted',
  COMPACT_SIGNED: 'compact-signed',
  FEEL_HEARD: 'feel-heard',
  STAGE_TRANSITION: 'stage-transition',
  SESSION_START: 'session-start',
} as const;

export type IndicatorType = (typeof IndicatorType)[keyof typeof IndicatorType];

// ============================================================================
// Message Status Types
// ============================================================================

/**
 * Status for AI messages - tracks streaming and delivery state.
 */
export const AIMessageStatus = {
  STREAMING: 'streaming',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  ERROR: 'error',
} as const;

export type AIMessageStatus = (typeof AIMessageStatus)[keyof typeof AIMessageStatus];

/**
 * Status for user messages - tracks sending and delivery state.
 */
export const UserMessageStatus = {
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  ERROR: 'error',
} as const;

export type UserMessageStatus = (typeof UserMessageStatus)[keyof typeof UserMessageStatus];

// ============================================================================
// Base Interface
// ============================================================================

/**
 * Base interface for all chat items. Provides common fields for
 * identity, type discrimination, and timeline ordering.
 */
export interface BaseChatItem {
  /** Item type for type discrimination */
  type: ChatItemType;
  /** Unique identifier */
  id: string;
  /** ISO timestamp for timeline ordering */
  timestamp: string;
}

// ============================================================================
// AI Message Item
// ============================================================================

/**
 * AI-generated message in the chat.
 * Supports streaming (typewriter effect) and delivery tracking.
 */
export interface AIMessageItem extends BaseChatItem {
  type: typeof ChatItemType.AI_MESSAGE;
  /** Message content (may be partial during streaming) */
  content: string;
  /** Delivery/streaming status */
  status: AIMessageStatus;
}

// ============================================================================
// User Message Item
// ============================================================================

/**
 * User-sent message in the chat.
 * Tracks sending status and supports retry on error.
 */
export interface UserMessageItem extends BaseChatItem {
  type: typeof ChatItemType.USER_MESSAGE;
  /** Message content */
  content: string;
  /** Delivery status */
  status: UserMessageStatus;
  /** Whether the message can be retried (set when status is 'error') */
  canRetry?: boolean;
}

// ============================================================================
// Empathy Statement Item
// ============================================================================

/**
 * User's shared empathy statement (Stage 2).
 * Shows "What you shared" with delivery tracking to partner.
 */
export interface EmpathyStatementItem extends BaseChatItem {
  type: typeof ChatItemType.EMPATHY_STATEMENT;
  /** The empathy statement content */
  content: string;
  /** Delivery status to partner */
  deliveryStatus: SharedContentDeliveryStatus;
}

// ============================================================================
// Shared Context Item
// ============================================================================

/**
 * Context shared from subject to guesser via reconciler (Stage 2).
 * Shows "New context from [partner]" with delivery tracking.
 */
export interface SharedContextItem extends BaseChatItem {
  type: typeof ChatItemType.SHARED_CONTEXT;
  /** The shared context content */
  content: string;
  /** Delivery status to recipient */
  deliveryStatus: SharedContentDeliveryStatus;
  /** Name of the partner who shared (for personalized label) */
  partnerName?: string;
}

// ============================================================================
// Share Suggestion Item
// ============================================================================

/**
 * AI-suggested content for subject to share with guesser (Stage 2).
 * Shows "SUGGESTED TO SHARE" with the proposed content.
 */
export interface ShareSuggestionItem extends BaseChatItem {
  type: typeof ChatItemType.SHARE_SUGGESTION;
  /** The suggested content to share */
  content: string;
}

// ============================================================================
// System Message Item
// ============================================================================

/**
 * System-generated message (transitions, notifications, etc.).
 * Rendered centered with muted styling.
 */
export interface SystemMessageItem extends BaseChatItem {
  type: typeof ChatItemType.SYSTEM_MESSAGE;
  /** Message content */
  content: string;
}

// ============================================================================
// Indicator Item
// ============================================================================

/**
 * Timeline indicator marking a significant event or milestone.
 * Examples: invitation sent, compact signed, feel-heard confirmed.
 */
export interface IndicatorItem extends BaseChatItem {
  type: typeof ChatItemType.INDICATOR;
  /** Specific indicator type */
  indicatorType: IndicatorType;
  /** Additional context for the indicator */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Emotion Change Item
// ============================================================================

/**
 * Record of emotional intensity change.
 * Currently hidden from display (renderer returns null) but included
 * in timeline for data completeness.
 */
export interface EmotionChangeItem extends BaseChatItem {
  type: typeof ChatItemType.EMOTION_CHANGE;
  /** Current emotional intensity (1-10) */
  intensity: number;
  /** Previous intensity for comparison */
  previousIntensity?: number;
}

// ============================================================================
// ChatItem Union Type
// ============================================================================

/**
 * Discriminated union of all possible chat item types.
 * Use type narrowing with the `type` field for type-safe access.
 *
 * @example
 * if (item.type === ChatItemType.AI_MESSAGE) {
 *   // TypeScript knows item is AIMessageItem here
 *   console.log(item.status);
 * }
 */
export type ChatItem =
  | AIMessageItem
  | UserMessageItem
  | EmpathyStatementItem
  | SharedContextItem
  | ShareSuggestionItem
  | SystemMessageItem
  | IndicatorItem
  | EmotionChangeItem;

// ============================================================================
// Animation State for Renderers
// ============================================================================

/**
 * Animation state passed to chat item renderers.
 * Controls typewriter effect, fade-in, and sequencing.
 */
export const AnimationState = {
  /** Item is currently animating (typewriter or fade-in) */
  ANIMATING: 'animating',
  /** Animation has completed */
  COMPLETE: 'complete',
  /** Item is hidden (waiting for its turn in animation queue) */
  HIDDEN: 'hidden',
} as const;

export type AnimationState = (typeof AnimationState)[keyof typeof AnimationState];

/**
 * ChatItem with animation state attached.
 * Used by the animation queue hook to pass state to renderers.
 */
export type ChatItemWithAnimation = ChatItem & {
  /** Current animation state */
  animationState: AnimationState;
};

// ============================================================================
// Timeline API Response
// ============================================================================

/**
 * Response from GET /sessions/:id/timeline endpoint.
 * Supports cursor-based pagination with before timestamp.
 */
export interface TimelineResponse {
  /** Chat items sorted by timestamp descending (newest first) */
  items: ChatItem[];
  /** Whether more items exist before the oldest returned item */
  hasMore: boolean;
}

/**
 * Request params for GET /sessions/:id/timeline endpoint.
 */
export interface TimelineRequest {
  /** Cursor: return items before this timestamp */
  before?: string;
  /** Maximum number of message items to return (default 20) */
  limit?: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for AIMessageItem
 */
export function isAIMessage(item: ChatItem): item is AIMessageItem {
  return item.type === ChatItemType.AI_MESSAGE;
}

/**
 * Type guard for UserMessageItem
 */
export function isUserMessage(item: ChatItem): item is UserMessageItem {
  return item.type === ChatItemType.USER_MESSAGE;
}

/**
 * Type guard for EmpathyStatementItem
 */
export function isEmpathyStatement(item: ChatItem): item is EmpathyStatementItem {
  return item.type === ChatItemType.EMPATHY_STATEMENT;
}

/**
 * Type guard for SharedContextItem
 */
export function isSharedContext(item: ChatItem): item is SharedContextItem {
  return item.type === ChatItemType.SHARED_CONTEXT;
}

/**
 * Type guard for ShareSuggestionItem
 */
export function isShareSuggestion(item: ChatItem): item is ShareSuggestionItem {
  return item.type === ChatItemType.SHARE_SUGGESTION;
}

/**
 * Type guard for SystemMessageItem
 */
export function isSystemMessage(item: ChatItem): item is SystemMessageItem {
  return item.type === ChatItemType.SYSTEM_MESSAGE;
}

/**
 * Type guard for IndicatorItem
 */
export function isIndicator(item: ChatItem): item is IndicatorItem {
  return item.type === ChatItemType.INDICATOR;
}

/**
 * Type guard for EmotionChangeItem
 */
export function isEmotionChange(item: ChatItem): item is EmotionChangeItem {
  return item.type === ChatItemType.EMOTION_CHANGE;
}

/**
 * Type guard for any message type (AI, User, System, Empathy, SharedContext, ShareSuggestion)
 */
export function isMessage(item: ChatItem): item is AIMessageItem | UserMessageItem | SystemMessageItem | EmpathyStatementItem | SharedContextItem | ShareSuggestionItem {
  return (
    item.type === ChatItemType.AI_MESSAGE ||
    item.type === ChatItemType.USER_MESSAGE ||
    item.type === ChatItemType.SYSTEM_MESSAGE ||
    item.type === ChatItemType.EMPATHY_STATEMENT ||
    item.type === ChatItemType.SHARED_CONTEXT ||
    item.type === ChatItemType.SHARE_SUGGESTION
  );
}

// ============================================================================
// Ably Event Payloads
// ============================================================================

/**
 * Ably event for new chat item.
 * Event name: 'chat-item:new'
 */
export interface ChatItemNewPayload {
  /** Session ID */
  sessionId: string;
  /** Event timestamp */
  timestamp: number;
  /** User ID this item is for (for filtering) */
  forUserId?: string;
  /** The new chat item */
  item: ChatItem;
}

/**
 * Ably event for updating an existing chat item.
 * Event name: 'chat-item:update'
 */
export interface ChatItemUpdatePayload {
  /** Session ID */
  sessionId: string;
  /** Event timestamp */
  timestamp: number;
  /** User ID this update is for (for filtering) */
  forUserId?: string;
  /** ID of the item to update */
  id: string;
  /** Partial changes to apply */
  changes: Partial<Omit<ChatItem, 'type' | 'id'>>;
}
