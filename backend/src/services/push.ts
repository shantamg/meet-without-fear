import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import type { SessionEvent } from './realtime';
import { Stage, STAGE_FRIENDLY_NAMES } from '@meet-without-fear/shared';

/**
 * Expo SDK instance for sending push notifications.
 * Only created if we actually need to send notifications.
 */
let expoClient: Expo | null = null;

function getExpo(): Expo {
  if (!expoClient) {
    expoClient = new Expo();
  }
  return expoClient;
}

/**
 * Reset the Expo client (useful for testing).
 */
export function resetExpoClient(): void {
  expoClient = null;
}

interface PushMessageTemplate {
  title: string;
  body: string;
}

interface PushMessageContext {
  actorName: string;
  actorNamePossessive: string;
  stageName: string;
}

/**
 * Push notification message templates for each session event type.
 * Use {actor} for the other person's display name. The send path resolves it
 * from the recipient's relationship nickname when available.
 */
export const PUSH_MESSAGES: Record<SessionEvent, PushMessageTemplate> = {
  'partner.signed_compact': {
    title: '{actor} is ready',
    body: 'You can begin the session when you are ready.',
  },
  'partner.stage_completed': {
    title: '{actor} finished {stageName}',
    body: 'It is your turn to continue.',
  },
  'partner.advanced': {
    title: 'Next step is ready',
    body: '{actor} is ready for the next step with you.',
  },
  'partner.empathy_shared': {
    title: '{actorPossessive} empathy is ready',
    body: 'Read what {actor} understood about your experience.',
  },
  'partner.additional_context_shared': {
    title: 'More context shared',
    body: '{actor} added context to help you understand them better.',
  },
  'partner.needs_confirmed': {
    title: '{actor} confirmed needs',
    body: 'You can continue the needs step.',
  },
  'partner.needs_validated': {
    title: '{actor} checked the needs list',
    body: 'Open the session to continue the repair process.',
  },
  'partner.needs_shared': {
    title: '{actorPossessive} needs are ready',
    body: 'Open the session to review the needs list.',
  },
  'session.strategies_updated': {
    title: 'Repair ideas are ready',
    body: 'There are new repair ideas to review together.',
  },
  'partner.ranking_submitted': {
    title: '{actor} ranked repair ideas',
    body: 'Open the session to compare rankings.',
  },
  'partner.ready_to_rank': {
    title: '{actor} is ready to rank',
    body: 'You can start ranking repair ideas.',
  },
  'partner.consent_granted': {
    title: 'Content shared',
    body: '{actor} shared content for this session.',
  },
  'partner.consent_revoked': {
    title: 'Content withdrawn',
    body: '{actor} withdrew shared content from this session.',
  },
  'agreement.proposed': {
    title: 'Agreement ready to review',
    body: '{actor} proposed a new agreement.',
  },
  'agreement.confirmed': {
    title: '{actor} confirmed an agreement',
    body: "Take a look when you're ready.",
  },
  'session.paused': {
    title: 'Session paused',
    body: '{actor} needs a moment. The session is paused.',
  },
  'session.resumed': {
    title: 'Session resumed',
    body: '{actor} is back. Ready to continue?',
  },
  'session.resolved': {
    title: 'Session complete',
    body: 'Your conversation has been resolved.',
  },
  'session.joined': {
    title: '{actor} joined',
    body: '{actor} accepted your invitation. Open the session to continue together.',
  },
  'session.needs_reveal_ready': {
    title: 'Ready to reveal',
    body: 'You are both ready to reveal needs side by side.',
  },
  'invitation.declined': {
    title: 'Invitation declined',
    body: '{actor} has declined the session invitation.',
  },
  'invitation.confirmed': {
    title: 'Invitation confirmed',
    body: '{actor} confirmed the invitation message.',
  },
  // Empathy reconciler events
  'partner.empathy_revealed': {
    title: '{actorPossessive} empathy is visible',
    body: 'Open the session to read it.',
  },
  'partner.skipped_refinement': {
    title: '{actor} accepted the current understanding',
    body: 'You can move to the next step.',
  },
  'empathy.share_suggestion': {
    title: 'Help {actor} understand',
    body: 'You can share a little more context when you are ready.',
  },
  'empathy.context_shared': {
    title: '{actor} shared more context',
    body: 'It is your turn to refine your empathy.',
  },
  'empathy.revealed': {
    title: 'Your empathy is revealed',
    body: 'Your empathy statement has been shared with {actor}.',
  },
  'empathy.refining': {
    title: 'New context to consider',
    body: '{actor} shared something to help you refine your empathy.',
  },
  'empathy.status_updated': {
    title: 'Empathy step updated',
    body: 'Open the session to see what is ready now.',
  },
  'notification.pending_action': {
    title: 'Action needed',
    body: 'You have a new item to review in your activity menu.',
  },
  'empathy.resubmitted': {
    title: 'Updated empathy',
    body: '{actor} refined their understanding of your experience.',
  },
};

function possessive(name: string): string {
  if (name === 'They') {
    return 'Their';
  }
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

function getActorUserId(data: Record<string, unknown>): string | null {
  const candidate =
    data.triggeredByUserId ??
    data.signedBy ??
    data.completedBy ??
    data.sharedBy ??
    data.confirmedBy ??
    data.validatedBy ??
    data.submittedBy ??
    data.readyBy ??
    data.pausedBy ??
    data.resumedBy ??
    data.resolvedBy ??
    data.proposedBy ??
    data.joinedBy;

  return typeof candidate === 'string' ? candidate : null;
}

function getStageName(data: Record<string, unknown>): string {
  switch (data.stage) {
    case Stage.ONBOARDING:
      return STAGE_FRIENDLY_NAMES[Stage.ONBOARDING];
    case Stage.WITNESS:
      return STAGE_FRIENDLY_NAMES[Stage.WITNESS];
    case Stage.PERSPECTIVE_STRETCH:
      return STAGE_FRIENDLY_NAMES[Stage.PERSPECTIVE_STRETCH];
    case Stage.NEED_MAPPING:
      return STAGE_FRIENDLY_NAMES[Stage.NEED_MAPPING];
    case Stage.STRATEGIC_REPAIR:
      return STAGE_FRIENDLY_NAMES[Stage.STRATEGIC_REPAIR];
    case Stage.INFORMED_EMPATHY:
      return STAGE_FRIENDLY_NAMES[Stage.INFORMED_EMPATHY];
    default:
      return 'the current step';
  }
}

async function getPushMessageTemplate(
  userId: string,
  event: SessionEvent,
  data: Record<string, unknown>,
  sessionId: string,
): Promise<PushMessageTemplate> {
  if (event === 'partner.signed_compact') {
    const actorUserId = getActorUserId(data);

    if (actorUserId && actorUserId !== userId) {
      const invitation = await prisma.invitation.findFirst({
        where: {
          sessionId,
          invitedById: userId,
          status: 'ACCEPTED',
        },
        select: {
          invitedById: true,
        },
      });

      if (invitation) {
        return {
          title: '{actor} accepted your invitation',
          body: '{actor} has started their side of the session. Open it to continue.',
        };
      }
    }
  }

  return PUSH_MESSAGES[event] || {
    title: 'Meet Without Fear',
    body: 'You have an update',
  };
}

async function getNotificationActorName(
  recipientUserId: string,
  sessionId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const actorUserId = getActorUserId(data);
  if (!actorUserId || actorUserId === recipientUserId) {
    return 'They';
  }

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        relationship: {
          select: {
            members: {
              where: { userId: { in: [recipientUserId, actorUserId] } },
              select: {
                userId: true,
                nickname: true,
                user: {
                  select: {
                    firstName: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const members = session?.relationship.members ?? [];
    const recipientMember = members.find(member => member.userId === recipientUserId);
    const actorMember = members.find(member => member.userId === actorUserId);

    return recipientMember?.nickname || actorMember?.user.firstName || actorMember?.user.name || 'They';
  } catch (error) {
    logger.warn(`[Push] Failed to resolve notification actor name for session ${sessionId}:`, error);
    return 'They';
  }
}

function renderPushMessage(template: PushMessageTemplate, context: PushMessageContext): PushMessageTemplate {
  const render = (value: string) =>
    value
      .replace(/\{actor\}/g, context.actorName)
      .replace(/\{actorPossessive\}/g, context.actorNamePossessive)
      .replace(/\{stageName\}/g, context.stageName);

  return {
    title: render(template.title),
    body: render(template.body),
  };
}

/**
 * Sends a push notification to a user.
 * Fetches the user's push token from the database and sends the notification via Expo.
 *
 * @param userId - The user ID to send the notification to
 * @param event - The session event type (determines message content)
 * @param data - Additional data to include in the notification payload
 * @param sessionId - The session ID for deep linking
 * @returns Promise<boolean> - true if notification was sent successfully
 */
export async function sendPushNotification(
  userId: string,
  event: SessionEvent,
  data: Record<string, unknown>,
  sessionId: string,
): Promise<boolean> {
  try {
    // Fetch user's push token from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });

    if (!user?.pushToken) {
      logger.info(`[Push] No push token for user ${userId}`);
      return false;
    }

    // Validate the push token format
    if (!Expo.isExpoPushToken(user.pushToken)) {
      logger.warn(`[Push] Invalid push token format for user ${userId}: ${user.pushToken}`);
      return false;
    }

    const template = await getPushMessageTemplate(userId, event, data, sessionId);
    const actorName = await getNotificationActorName(userId, sessionId, data);
    const message = renderPushMessage(template, {
      actorName,
      actorNamePossessive: possessive(actorName),
      stageName: getStageName(data),
    });

    // Construct the push notification
    const pushMessage: ExpoPushMessage = {
      to: user.pushToken,
      sound: 'default',
      title: message.title,
      body: message.body,
      data: {
        screen: 'session',
        sessionId,
        event,
        ...data,
      },
    };

    // Send the notification via Expo
    const expo = getExpo();
    const tickets = await expo.sendPushNotificationsAsync([pushMessage]);

    // Check if the notification was sent successfully
    const ticket = tickets[0];
    if (ticket.status === 'ok') {
      logger.info(`[Push] Sent ${event} notification to user ${userId}`);
      return true;
    } else {
      // Handle error cases
      if (ticket.status === 'error') {
        logger.error(`[Push] Failed to send notification to user ${userId}:`, ticket.message);

        // If token is invalid, we could clean it up here
        if (ticket.details?.error === 'DeviceNotRegistered' || ticket.details?.error === 'InvalidCredentials') {
          logger.info(`[Push] Clearing invalid token for user ${userId}`);
          await prisma.user.update({
            where: { id: userId },
            data: { pushToken: null },
          });
        }
      }
      return false;
    }
  } catch (error) {
    logger.error(`[Push] Error sending notification to user ${userId}:`, error);
    return false;
  }
}

/**
 * Sends push notifications to multiple users.
 *
 * @param userIds - Array of user IDs to notify
 * @param event - The session event type
 * @param data - Additional data for the notification
 * @param sessionId - The session ID
 * @returns Promise<number> - Number of successfully sent notifications
 */
export async function sendPushNotifications(
  userIds: string[],
  event: SessionEvent,
  data: Record<string, unknown>,
  sessionId: string,
): Promise<number> {
  const results = await Promise.all(userIds.map(userId => sendPushNotification(userId, event, data, sessionId)));
  return results.filter(Boolean).length;
}

/**
 * Validates if a string is a valid Expo push token.
 *
 * @param token - The token to validate
 * @returns boolean - true if valid
 */
export function isValidPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}
