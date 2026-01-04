/**
 * Notification DTOs for Meet Without Fear
 *
 * Types for in-app notifications including invitation acceptance,
 * session activity, and partner interactions.
 */

import { NotificationType } from '../enums';

// ============================================================================
// Core Notification DTO
// ============================================================================

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  /** Optional session ID for deep linking */
  sessionId?: string;
  /** Optional invitation ID for deep linking */
  invitationId?: string;
  /** Name of the person who triggered the notification */
  actorName?: string;
}

// ============================================================================
// List Response (with cursor-based pagination)
// ============================================================================

export interface NotificationListResponseDTO {
  notifications: NotificationDTO[];
  /** Cursor for next page (null if no more pages) */
  nextCursor: string | null;
  /** Total unread count (convenience for badge display) */
  unreadCount: number;
}

// ============================================================================
// Unread Count Response
// ============================================================================

export interface UnreadCountResponseDTO {
  count: number;
}

// ============================================================================
// Mark Read Request/Response
// ============================================================================

export interface MarkReadRequestDTO {
  notificationId: string;
}

export interface MarkReadResponseDTO {
  success: boolean;
  /** Updated unread count after marking as read */
  unreadCount: number;
}

export interface MarkAllReadResponseDTO {
  success: boolean;
  /** Number of notifications marked as read */
  markedCount: number;
}

// ============================================================================
// Notification Content Templates
// ============================================================================

/**
 * Template for generating notification content based on type.
 * Used by backend to create consistent notification messages.
 */
export const NOTIFICATION_TEMPLATES: Record<NotificationType, { title: string; bodyTemplate: string }> = {
  [NotificationType.INVITATION_RECEIVED]: {
    title: 'New Invitation',
    bodyTemplate: '{actorName} invited you to start a conversation.',
  },
  [NotificationType.INVITATION_ACCEPTED]: {
    title: 'Invitation Accepted',
    bodyTemplate: '{actorName} accepted your invitation to start a conversation.',
  },
  [NotificationType.COMPACT_SIGNED]: {
    title: 'Curiosity Compact Signed',
    bodyTemplate: '{actorName} signed the Curiosity Compact and is ready to begin.',
  },
  [NotificationType.SESSION_JOINED]: {
    title: 'Partner Joined',
    bodyTemplate: '{actorName} has joined your session.',
  },
  [NotificationType.PARTNER_MESSAGE]: {
    title: 'New Message',
    bodyTemplate: '{actorName} sent you a message.',
  },
  [NotificationType.EMPATHY_SHARED]: {
    title: 'Empathy Received',
    bodyTemplate: '{actorName} shared their understanding of your experience.',
  },
  [NotificationType.NEEDS_SHARED]: {
    title: 'Needs Shared',
    bodyTemplate: '{actorName} shared their identified needs.',
  },
  [NotificationType.AGREEMENT_PROPOSED]: {
    title: 'New Agreement',
    bodyTemplate: 'A new agreement has been proposed in your session with {actorName}.',
  },
  [NotificationType.AGREEMENT_CONFIRMED]: {
    title: 'Agreement Confirmed',
    bodyTemplate: 'You and {actorName} have agreed on a path forward.',
  },
  [NotificationType.SESSION_RESOLVED]: {
    title: 'Session Complete',
    bodyTemplate: 'Congratulations! Your session with {actorName} has been resolved.',
  },
  [NotificationType.FOLLOW_UP_REMINDER]: {
    title: 'Follow-up Reminder',
    bodyTemplate: 'How is your agreement with {actorName} going?',
  },
};

/**
 * Generate notification body from template
 */
export function generateNotificationBody(
  type: NotificationType,
  actorName: string
): string {
  const template = NOTIFICATION_TEMPLATES[type];
  return template.bodyTemplate.replace('{actorName}', actorName);
}
