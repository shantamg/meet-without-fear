/**
 * Notification Service for Meet Without Fear
 *
 * Handles creating, retrieving, and managing in-app notifications.
 * Integrates with push notification service for external delivery.
 */

import { prisma } from '../lib/prisma';
import { NotificationType } from '@prisma/client';
import {
  NotificationDTO,
  NotificationListResponseDTO,
  NOTIFICATION_TEMPLATES,
  generateNotificationBody,
  NotificationType as SharedNotificationType,
  NotificationPreferencesDTO,
  DEFAULT_NOTIFICATION_PREFERENCES,
  REALTIME_CHANNELS,
} from '@meet-without-fear/shared';
import { sendPushNotification } from './push';
import type { SessionEvent } from './realtime';
import { getAbly } from './realtime';

// ============================================================================
// Types
// ============================================================================

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  sessionId?: string;
  invitationId?: string;
  actorName?: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create a new notification for a user.
 * Optionally sends a push notification if the user has push enabled and the
 * notification type is enabled in their preferences.
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<NotificationDTO> {
  const { userId, type, sessionId, invitationId, actorName } = params;

  // Get template for this notification type
  const template = NOTIFICATION_TEMPLATES[type as unknown as SharedNotificationType];
  const title = template?.title ?? 'Meet Without Fear';
  const body = actorName
    ? generateNotificationBody(type as unknown as SharedNotificationType, actorName)
    : template?.bodyTemplate ?? 'You have a new notification';

  // Create the notification in database (always created for in-app history)
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      sessionId,
      invitationId,
      actorName,
    },
  });

  // Publish notification to user's Ably channel for real-time updates
  try {
    const ably = getAbly();
    const userChannel = ably.channels.get(REALTIME_CHANNELS.user(userId));
    const notificationDTO = mapToDTO(notification);
    await userChannel.publish('notification.created', {
      notification: notificationDTO,
      unreadCount: await getUnreadCount(userId),
    });
    console.log(`[Notification] Published to user channel for ${userId}`);
  } catch (error) {
    console.error(`[Notification] Failed to publish to user channel for ${userId}:`, error);
    // Don't fail the notification creation if Ably publish fails
  }

  // Check user preferences before sending push notification
  if (sessionId) {
    const eventType = mapNotificationTypeToSessionEvent(type);
    if (eventType) {
      // Get user's notification preferences
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { notificationPreferences: true },
      });

      const prefs = (user?.notificationPreferences as NotificationPreferencesDTO | null)
        ?? DEFAULT_NOTIFICATION_PREFERENCES;

      // Only send push if preferences allow
      if (shouldSendPush(type, prefs)) {
        sendPushNotification(userId, eventType, { notificationId: notification.id }, sessionId).catch(
          (error) => console.error('[Notification] Push failed:', error)
        );
      } else {
        console.log(`[Notification] Push skipped for user ${userId} - disabled in preferences`);
      }
    }
  }

  return mapToDTO(notification);
}

/**
 * Get paginated notifications for a user.
 * Uses cursor-based pagination for infinite scroll support.
 */
export async function getNotifications(
  userId: string,
  cursor?: string,
  limit = 20
): Promise<NotificationListResponseDTO> {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Take one extra to determine if there's more
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip the cursor item itself
    }),
  });

  // Determine if there's a next page
  const hasMore = notifications.length > limit;
  const items = hasMore ? notifications.slice(0, limit) : notifications;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  // Get unread count for convenience
  const unreadCount = await prisma.notification.count({
    where: { userId, read: false },
  });

  return {
    notifications: items.map(mapToDTO),
    nextCursor,
    unreadCount,
  };
}

/**
 * Get the unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<{ success: boolean; unreadCount: number }> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });

  const unreadCount = await getUnreadCount(userId);
  return { success: true, unreadCount };
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(
  userId: string
): Promise<{ success: boolean; markedCount: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  return { success: true, markedCount: result.count };
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapToDTO(notification: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
  sessionId: string | null;
  invitationId: string | null;
  actorName: string | null;
}): NotificationDTO {
  return {
    id: notification.id,
    type: notification.type as unknown as SharedNotificationType,
    title: notification.title,
    body: notification.body,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
    sessionId: notification.sessionId ?? undefined,
    invitationId: notification.invitationId ?? undefined,
    actorName: notification.actorName ?? undefined,
  };
}

/**
 * Map notification type to session event type for push notifications.
 */
function mapNotificationTypeToSessionEvent(type: NotificationType): SessionEvent | null {
  const mapping: Partial<Record<NotificationType, SessionEvent>> = {
    SESSION_JOINED: 'session.joined',
    EMPATHY_SHARED: 'partner.empathy_shared',
    NEEDS_SHARED: 'partner.needs_shared',
    AGREEMENT_PROPOSED: 'agreement.proposed',
    AGREEMENT_CONFIRMED: 'agreement.confirmed',
    SESSION_RESOLVED: 'session.resolved',
  };
  return mapping[type] ?? null;
}

/**
 * Check if push notification should be sent based on user preferences.
 * Maps notification types to preference categories.
 */
function shouldSendPush(
  type: NotificationType,
  prefs: NotificationPreferencesDTO
): boolean {
  // Master toggle must be enabled
  if (!prefs.pushEnabled) {
    return false;
  }

  // Map notification types to preference categories
  const invitationTypes: NotificationType[] = [
    'INVITATION_RECEIVED',
    'INVITATION_ACCEPTED',
  ];

  const partnerActionTypes: NotificationType[] = [
    'COMPACT_SIGNED',
    'SESSION_JOINED',
    'PARTNER_MESSAGE',
    'EMPATHY_SHARED',
    'NEEDS_SHARED',
    'AGREEMENT_PROPOSED',
    'AGREEMENT_CONFIRMED',
    'SESSION_RESOLVED',
    'SESSION_ABANDONED',
  ];

  const followUpTypes: NotificationType[] = [
    'FOLLOW_UP_REMINDER',
  ];

  if (invitationTypes.includes(type)) {
    return prefs.newInvitations;
  }

  if (partnerActionTypes.includes(type)) {
    return prefs.partnerActions;
  }

  if (followUpTypes.includes(type)) {
    return prefs.followUpReminders;
  }

  // Default: allow if push is enabled
  return true;
}

// ============================================================================
// Notification Triggers (called from other services)
// ============================================================================

/**
 * Trigger notification when a user receives an invitation.
 * Called when the invitee acknowledges a pending invitation.
 */
export async function notifyInvitationReceived(
  inviteeId: string,
  inviterDisplayName: string,
  sessionId: string,
  invitationId: string
): Promise<void> {
  await createNotification({
    userId: inviteeId,
    type: 'INVITATION_RECEIVED',
    sessionId,
    invitationId,
    actorName: inviterDisplayName,
  });
}

/**
 * Trigger notification when an invitation is accepted.
 */
export async function notifyInvitationAccepted(
  inviterId: string,
  inviteeDisplayName: string,
  sessionId: string,
  invitationId: string
): Promise<void> {
  await createNotification({
    userId: inviterId,
    type: 'INVITATION_ACCEPTED',
    sessionId,
    invitationId,
    actorName: inviteeDisplayName,
  });
}

/**
 * Trigger notification when curiosity compact is signed.
 */
export async function notifyCompactSigned(
  partnerId: string,
  signerDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: partnerId,
    type: 'COMPACT_SIGNED',
    sessionId,
    actorName: signerDisplayName,
  });
}

/**
 * Trigger notification when partner joins session.
 */
export async function notifySessionJoined(
  partnerId: string,
  joinerDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: partnerId,
    type: 'SESSION_JOINED',
    sessionId,
    actorName: joinerDisplayName,
  });
}

/**
 * Trigger notification when empathy is shared.
 */
export async function notifyEmpathyShared(
  recipientId: string,
  sharerDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: recipientId,
    type: 'EMPATHY_SHARED',
    sessionId,
    actorName: sharerDisplayName,
  });
}

/**
 * Trigger notification when needs are shared.
 */
export async function notifyNeedsShared(
  recipientId: string,
  sharerDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: recipientId,
    type: 'NEEDS_SHARED',
    sessionId,
    actorName: sharerDisplayName,
  });
}

/**
 * Trigger notification when an agreement is proposed.
 */
export async function notifyAgreementProposed(
  recipientId: string,
  proposerDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: recipientId,
    type: 'AGREEMENT_PROPOSED',
    sessionId,
    actorName: proposerDisplayName,
  });
}

/**
 * Trigger notification when an agreement is confirmed.
 */
export async function notifyAgreementConfirmed(
  userId: string,
  partnerDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'AGREEMENT_CONFIRMED',
    sessionId,
    actorName: partnerDisplayName,
  });
}

/**
 * Trigger notification when session is resolved.
 */
export async function notifySessionResolved(
  userId: string,
  partnerDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'SESSION_RESOLVED',
    sessionId,
    actorName: partnerDisplayName,
  });
}

// ============================================================================
// Empathy Reconciler Flow Notifications (Phase 5)
// ============================================================================

/**
 * Trigger notification when partner's empathy statement is revealed to you.
 * Called when status transitions to REVEALED.
 */
export async function notifyEmpathyRevealed(
  recipientId: string,
  guesserDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: recipientId,
    type: 'EMPATHY_REVEALED',
    sessionId,
    actorName: guesserDisplayName,
  });
}

/**
 * Trigger notification when user's empathy statement needs refinement.
 * Called when reconciler sets status to NEEDS_WORK.
 */
export async function notifyEmpathyNeedsWork(
  guesserId: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: guesserId,
    type: 'EMPATHY_NEEDS_WORK',
    sessionId,
  });
}

/**
 * Trigger notification when partner validates your empathy statement.
 * Called when status transitions to VALIDATED.
 */
export async function notifyEmpathyValidated(
  guesserId: string,
  validatorDisplayName: string,
  sessionId: string
): Promise<void> {
  await createNotification({
    userId: guesserId,
    type: 'EMPATHY_VALIDATED',
    sessionId,
    actorName: validatorDisplayName,
  });
}
