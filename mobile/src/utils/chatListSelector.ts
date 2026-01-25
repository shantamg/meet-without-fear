/**
 * chatListSelector.ts
 *
 * Pure utility function for interleaving chat messages with indicators.
 * This moves the indicator calculation logic out of UnifiedSessionScreen
 * into a testable, reusable function that operates on the React Query cache data.
 *
 * The Single Source of Truth principle:
 * - All indicators are derived from cache data (timestamps on invitation, compact, milestones)
 * - No local state needed for tracking when indicators should show
 * - If the app reloads, the same indicators will appear based on the data
 */

import { Stage, MessageRole, SessionStatus } from '@meet-without-fear/shared';
import type { ChatIndicatorType } from '../components/ChatIndicator';

// ============================================================================
// Types
// ============================================================================

/**
 * Message data as stored in React Query cache.
 */
export interface CacheMessage {
  id: string;
  sessionId: string;
  senderId: string | null;
  role: MessageRole;
  content: string;
  stage: Stage;
  timestamp: string;
}

/**
 * Indicator item to be interleaved with messages.
 */
export interface IndicatorItem {
  type: 'indicator';
  indicatorType: ChatIndicatorType;
  id: string;
  timestamp: string;
  /** Optional metadata for dynamic indicator text */
  metadata?: {
    /** Whether this content is from the current user (vs partner) */
    isFromMe?: boolean;
    /** Partner's display name (for "Context from {name}" text) */
    partnerName?: string;
  };
}

/**
 * Session data needed for computing indicators.
 * This should be derived from the React Query cache.
 */
export interface SessionIndicatorData {
  /** Whether current user is the inviter */
  isInviter: boolean;

  /** Session status */
  sessionStatus?: SessionStatus;

  /** Current user's ID (for determining message ownership) */
  currentUserId?: string;

  /** Partner's display name (for "Context from {name}" text) */
  partnerName?: string;

  /** Invitation data from cache */
  invitation?: {
    /** When the inviter confirmed the invitation message */
    messageConfirmedAt?: string | null;
    /** When the invitee accepted the invitation */
    acceptedAt?: string | null;
  };

  /** Compact data from cache */
  compact?: {
    /** Whether current user has signed the compact */
    mySigned?: boolean;
    /** When current user signed the compact */
    mySignedAt?: string | null;
  };

  /** Milestones data from cache */
  milestones?: {
    /** When user confirmed they feel heard (Stage 1 completion) */
    feelHeardConfirmedAt?: string | null;
  };

  /** Session creation timestamp (fallback for compact indicator) */
  sessionCreatedAt?: string;
}

// ============================================================================
// Pure Derivation Function
// ============================================================================

/**
 * Derives indicator items from session data.
 *
 * This is a pure function that computes which indicators should be shown
 * and at what timestamps, based entirely on the cached session data.
 *
 * Benefits:
 * - Testable: Pure function with no side effects
 * - Consistent: Same data always produces same indicators
 * - Reload-safe: Indicators persist across app reloads because they're derived from persisted data
 * - No local state: Eliminates the need for optimisticConfirmTimestamp, optimisticFeelHeardTimestamp, etc.
 *
 * @param data - Session data from React Query cache
 * @returns Array of indicator items with timestamps
 */
export function deriveIndicators(data: SessionIndicatorData): IndicatorItem[] {
  const items: IndicatorItem[] = [];

  const { isInviter, invitation, compact, milestones, sessionCreatedAt } = data;

  // ---------------------------------------------------------------------------
  // Invitation Sent Indicator (for inviters)
  // ---------------------------------------------------------------------------
  // Shows when the inviter has confirmed the invitation message.
  // Uses the messageConfirmedAt timestamp from the invitation cache.
  if (isInviter && invitation?.messageConfirmedAt) {
    items.push({
      type: 'indicator',
      indicatorType: 'invitation-sent',
      id: 'invitation-sent',
      timestamp: invitation.messageConfirmedAt,
    });
  }

  // ---------------------------------------------------------------------------
  // Invitation Accepted Indicator (for invitees)
  // ---------------------------------------------------------------------------
  // Shows when the invitee has accepted the invitation.
  // Uses the acceptedAt timestamp from the invitation cache.
  if (!isInviter && invitation?.acceptedAt) {
    items.push({
      type: 'indicator',
      indicatorType: 'invitation-accepted',
      id: 'invitation-accepted',
      timestamp: invitation.acceptedAt,
    });
  }

  // ---------------------------------------------------------------------------
  // Compact Signed Indicator
  // ---------------------------------------------------------------------------
  // Shows when the current user has signed the curiosity compact.
  // Uses mySignedAt from compact cache, with sessionCreatedAt as fallback for older sessions.
  if (compact?.mySigned) {
    const compactSignedAt = compact.mySignedAt ?? sessionCreatedAt;
    if (compactSignedAt) {
      items.push({
        type: 'indicator',
        indicatorType: 'compact-signed',
        id: 'compact-signed',
        timestamp: compactSignedAt,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Feel Heard Indicator (Stage 1 completion)
  // ---------------------------------------------------------------------------
  // Shows when the user has confirmed they feel heard.
  // Uses feelHeardConfirmedAt from milestones cache.
  if (milestones?.feelHeardConfirmedAt) {
    items.push({
      type: 'indicator',
      indicatorType: 'feel-heard',
      id: 'feel-heard',
      timestamp: milestones.feelHeardConfirmedAt,
    });
  }

  return items;
}

/**
 * Interleaves messages with indicator items, sorted by timestamp.
 *
 * The indicators are inserted at their appropriate positions based on timestamps,
 * so they appear in chronological order with the messages.
 *
 * SHARED_CONTEXT messages are converted to collapsed 'context-shared' indicators
 * that link to the Sharing Status screen.
 *
 * @param messages - Array of chat messages from React Query cache
 * @param sessionData - Session data for deriving indicators
 * @returns Combined array of messages and indicators, sorted by timestamp (newest first)
 */
export function interleaveIndicators(
  messages: CacheMessage[],
  sessionData: SessionIndicatorData
): (CacheMessage | IndicatorItem)[] {
  // Derive indicators from session data
  const indicators = deriveIndicators(sessionData);

  // Filter out SHARED_CONTEXT messages and convert them to collapsed indicators
  const filteredMessages: CacheMessage[] = [];
  const sharedContextIndicators: IndicatorItem[] = [];

  for (const message of messages) {
    if (message.role === MessageRole.SHARED_CONTEXT) {
      // Determine if this is from the current user or partner
      const isFromMe = sessionData.currentUserId ? message.senderId === sessionData.currentUserId : true;

      // Convert SHARED_CONTEXT to collapsed indicator
      sharedContextIndicators.push({
        type: 'indicator',
        indicatorType: 'context-shared',
        id: `context-shared-${message.id}`,
        timestamp: message.timestamp,
        metadata: {
          isFromMe,
          partnerName: sessionData.partnerName,
        },
      });
    } else {
      filteredMessages.push(message);
    }
  }

  // Combine filtered messages, derived indicators, and shared context indicators
  const combined: (CacheMessage | IndicatorItem)[] = [
    ...filteredMessages,
    ...indicators,
    ...sharedContextIndicators,
  ];

  // Sort by timestamp (newest first for inverted FlatList)
  combined.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();

    // Primary sort: Time (newest first)
    if (bTime !== aTime) return bTime - aTime;

    // Secondary sort: ID (stable tie-breaker)
    return b.id.localeCompare(a.id);
  });

  return combined;
}

/**
 * Checks if the last message in the list is from the user.
 * Used to determine if typing indicator (ghost dots) should be shown.
 *
 * This replaces the waitingForAIResponse boolean state:
 * - If last message is from USER, we're waiting for AI response → show typing indicator
 * - If last message is from AI/SYSTEM, response has arrived → hide typing indicator
 *
 * @param messages - Array of messages (can be empty)
 * @returns true if waiting for AI response (last message is from user)
 */
export function isWaitingForAIResponse(messages: CacheMessage[]): boolean {
  if (messages.length === 0) return false;

  // Messages are sorted newest-first, so the first element is the latest message
  const lastMessage = messages[0];

  // If the last message is from the user, we're waiting for AI
  return lastMessage.role === MessageRole.USER;
}

