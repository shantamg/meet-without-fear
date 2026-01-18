/**
 * Timeline Aggregator Service
 *
 * Aggregates messages, indicators, and other timeline items into a unified
 * ChatItem[] for the timeline endpoint.
 *
 * Key responsibilities:
 * 1. Query messages, emotional readings, and session milestones
 * 2. Transform database records to ChatItem DTOs
 * 3. Derive indicator items from session state
 * 4. Sort and paginate the combined timeline
 */

import { prisma } from '../lib/prisma';
import { MessageRole as PrismaMessageRole } from '@prisma/client';
import {
  ChatItem,
  ChatItemType,
  AIMessageItem,
  UserMessageItem,
  EmpathyStatementItem,
  SharedContextItem,
  ShareSuggestionItem,
  SystemMessageItem,
  IndicatorItem,
  EmotionChangeItem,
  IndicatorType,
  AIMessageStatus,
  UserMessageStatus,
  SharedContentDeliveryStatus,
  TimelineResponse,
} from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export interface TimelineAggregatorOptions {
  sessionId: string;
  userId: string;
  /** Return items before this timestamp (cursor pagination) */
  before?: string;
  /** Maximum number of message items to return (non-messages within range included) */
  limit?: number;
}

interface SessionContext {
  isInviter: boolean;
  createdAt: Date;
  invitation?: {
    messageConfirmedAt: Date | null;
    acceptedAt: Date | null;
  };
  compact?: {
    mySigned: boolean;
    mySignedAt: string | null;
  };
  milestones?: {
    feelHeardConfirmedAt: Date | null;
  };
  partnerName?: string;
}

interface CompactGates {
  compactSigned: boolean;
  signedAt?: string;
}

interface FeelHeardGates {
  feelHeardConfirmed: boolean;
  confirmedAt?: string;
}

// ============================================================================
// Message Role Mapping
// ============================================================================

/**
 * Map Prisma MessageRole to ChatItemType
 */
function mapMessageRoleToItemType(role: PrismaMessageRole): ChatItemType | null {
  switch (role) {
    case 'USER':
      return ChatItemType.USER_MESSAGE;
    case 'AI':
      return ChatItemType.AI_MESSAGE;
    case 'SYSTEM':
      return ChatItemType.SYSTEM_MESSAGE;
    case 'EMPATHY_STATEMENT':
      return ChatItemType.EMPATHY_STATEMENT;
    case 'SHARED_CONTEXT':
      return ChatItemType.SHARED_CONTEXT;
    case 'SHARE_SUGGESTION':
      return ChatItemType.SHARE_SUGGESTION;
    default:
      // EMPATHY_REVEAL_INTRO and other types - treat as system messages
      return ChatItemType.SYSTEM_MESSAGE;
  }
}

// ============================================================================
// Message Transformers
// ============================================================================

interface DbMessage {
  id: string;
  role: PrismaMessageRole;
  content: string;
  timestamp: Date;
  senderId: string | null;
}

/**
 * Transform database message to ChatItem
 */
function transformMessage(
  msg: DbMessage,
  context: SessionContext
): ChatItem | null {
  const itemType = mapMessageRoleToItemType(msg.role);
  if (!itemType) return null;

  const baseItem = {
    id: msg.id,
    timestamp: msg.timestamp.toISOString(),
  };

  switch (itemType) {
    case ChatItemType.AI_MESSAGE:
      return {
        ...baseItem,
        type: ChatItemType.AI_MESSAGE,
        content: msg.content,
        status: AIMessageStatus.SENT, // Historical messages are always 'sent'
      } as AIMessageItem;

    case ChatItemType.USER_MESSAGE:
      return {
        ...baseItem,
        type: ChatItemType.USER_MESSAGE,
        content: msg.content,
        status: UserMessageStatus.SENT, // Historical messages are always 'sent'
      } as UserMessageItem;

    case ChatItemType.SYSTEM_MESSAGE:
      return {
        ...baseItem,
        type: ChatItemType.SYSTEM_MESSAGE,
        content: msg.content,
      } as SystemMessageItem;

    case ChatItemType.EMPATHY_STATEMENT:
      return {
        ...baseItem,
        type: ChatItemType.EMPATHY_STATEMENT,
        content: msg.content,
        // Historical empathy statements are assumed delivered
        deliveryStatus: SharedContentDeliveryStatus.DELIVERED,
      } as EmpathyStatementItem;

    case ChatItemType.SHARED_CONTEXT:
      return {
        ...baseItem,
        type: ChatItemType.SHARED_CONTEXT,
        content: msg.content,
        deliveryStatus: SharedContentDeliveryStatus.DELIVERED,
        partnerName: context.partnerName,
      } as SharedContextItem;

    case ChatItemType.SHARE_SUGGESTION:
      return {
        ...baseItem,
        type: ChatItemType.SHARE_SUGGESTION,
        content: msg.content,
      } as ShareSuggestionItem;

    default:
      return null;
  }
}

// ============================================================================
// Indicator Derivation
// ============================================================================

/**
 * Derive indicator items from session context
 */
function deriveIndicators(context: SessionContext): IndicatorItem[] {
  const indicators: IndicatorItem[] = [];

  // Invitation Sent (for inviters)
  if (context.isInviter && context.invitation?.messageConfirmedAt) {
    indicators.push({
      type: ChatItemType.INDICATOR,
      id: 'invitation-sent',
      timestamp: context.invitation.messageConfirmedAt.toISOString(),
      indicatorType: IndicatorType.INVITATION_SENT,
    });
  }

  // Invitation Accepted (for invitees)
  if (!context.isInviter && context.invitation?.acceptedAt) {
    indicators.push({
      type: ChatItemType.INDICATOR,
      id: 'invitation-accepted',
      timestamp: context.invitation.acceptedAt.toISOString(),
      indicatorType: IndicatorType.INVITATION_ACCEPTED,
    });
  }

  // Compact Signed
  if (context.compact?.mySigned && context.compact.mySignedAt) {
    indicators.push({
      type: ChatItemType.INDICATOR,
      id: 'compact-signed',
      timestamp: context.compact.mySignedAt,
      indicatorType: IndicatorType.COMPACT_SIGNED,
    });
  }

  // Feel Heard (Stage 1 completion)
  if (context.milestones?.feelHeardConfirmedAt) {
    indicators.push({
      type: ChatItemType.INDICATOR,
      id: 'feel-heard',
      timestamp: context.milestones.feelHeardConfirmedAt.toISOString(),
      indicatorType: IndicatorType.FEEL_HEARD,
    });
  }

  return indicators;
}

// ============================================================================
// Emotion Change Derivation
// ============================================================================

interface DbEmotionalReading {
  id: string;
  intensity: number;
  timestamp: Date;
}

/**
 * Transform emotional readings to EmotionChangeItem (not displayed but included for data completeness)
 */
function transformEmotionalReadings(
  readings: DbEmotionalReading[]
): EmotionChangeItem[] {
  return readings.map((reading, index): EmotionChangeItem => ({
    type: ChatItemType.EMOTION_CHANGE,
    id: `emotion-${reading.id}`,
    timestamp: reading.timestamp.toISOString(),
    intensity: reading.intensity,
    previousIntensity: index > 0 ? readings[index - 1].intensity : undefined,
  }));
}

// ============================================================================
// Main Aggregator
// ============================================================================

/**
 * Aggregate timeline items for a session
 */
export async function aggregateTimeline(
  options: TimelineAggregatorOptions
): Promise<TimelineResponse> {
  const { sessionId, userId, before, limit = 20 } = options;

  // 1. Get session context for indicator derivation
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      invitations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      relationship: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      stageProgress: {
        where: { userId },
      },
    },
  });

  if (!session) {
    return { items: [], hasMore: false };
  }

  // Get the first (most recent) invitation
  const invitation = session.invitations[0];

  // Determine if current user is the inviter
  const isInviter = invitation?.invitedById === userId;

  // Get partner name
  const partnerMember = session.relationship.members.find(
    (m) => m.userId !== userId
  );
  const partnerName = partnerMember?.user?.name || undefined;

  // Get compact status from Stage 0 progress
  const stage0Progress = session.stageProgress.find((p) => p.stage === 0);
  const compactGates = stage0Progress?.gatesSatisfied as CompactGates | null;
  const mySigned = compactGates?.compactSigned ?? false;
  const mySignedAt = compactGates?.signedAt ?? null;

  // Get feel-heard milestone from Stage 1 progress
  const stage1Progress = session.stageProgress.find((p) => p.stage === 1);
  const feelHeardGates = stage1Progress?.gatesSatisfied as FeelHeardGates | null;
  const feelHeardConfirmedAt =
    feelHeardGates?.feelHeardConfirmed && stage1Progress?.completedAt
      ? stage1Progress.completedAt
      : null;

  // Build session context
  const context: SessionContext = {
    isInviter,
    createdAt: session.createdAt,
    invitation: invitation
      ? {
          messageConfirmedAt: invitation.messageConfirmedAt,
          acceptedAt: invitation.acceptedAt,
        }
      : undefined,
    compact: { mySigned, mySignedAt },
    milestones: { feelHeardConfirmedAt },
    partnerName,
  };

  // 2. Build cursor condition for messages
  const cursorCondition = before
    ? { timestamp: { lt: new Date(before) } }
    : {};

  // 3. Query messages (limit + 1 to check hasMore)
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      OR: [
        // Messages user sent without a specific recipient
        { senderId: userId, forUserId: null },
        // Messages specifically for this user
        { forUserId: userId },
      ],
      ...cursorCondition,
    },
    orderBy: { timestamp: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      role: true,
      content: true,
      timestamp: true,
      senderId: true,
    },
  });

  // Check if there are more messages
  const hasMore = messages.length > limit;
  const messageItems = hasMore ? messages.slice(0, limit) : messages;

  // 4. Determine timestamp range for non-message items
  const oldestMsgTimestamp =
    messageItems.length > 0
      ? messageItems[messageItems.length - 1].timestamp
      : new Date(0);
  const newestMsgTimestamp =
    messageItems.length > 0
      ? messageItems[0].timestamp
      : new Date();

  // 5. Get emotional readings within timestamp range via UserVessel
  const userVessel = await prisma.userVessel.findFirst({
    where: {
      sessionId,
      userId,
    },
    include: {
      emotionalReadings: {
        where: {
          timestamp: {
            gte: oldestMsgTimestamp,
            lte: newestMsgTimestamp,
          },
        },
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          intensity: true,
          timestamp: true,
        },
      },
    },
  });

  const emotionalReadings = userVessel?.emotionalReadings ?? [];

  // 6. Transform all items
  const chatItems: ChatItem[] = [];

  // Transform messages
  for (const msg of messageItems) {
    const item = transformMessage(msg, context);
    if (item) {
      chatItems.push(item);
    }
  }

  // Add indicators (filter to timestamp range)
  const indicators = deriveIndicators(context);
  for (const indicator of indicators) {
    const indicatorTime = new Date(indicator.timestamp);
    if (indicatorTime >= oldestMsgTimestamp && indicatorTime <= newestMsgTimestamp) {
      chatItems.push(indicator);
    }
  }

  // Add emotion changes (hidden but included for data)
  const emotionItems = transformEmotionalReadings(emotionalReadings);
  chatItems.push(...emotionItems);

  // 7. Sort by timestamp descending (newest first)
  chatItems.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    if (bTime !== aTime) return bTime - aTime;
    // Stable tie-breaker by ID
    return b.id.localeCompare(a.id);
  });

  return {
    items: chatItems,
    hasMore,
  };
}
