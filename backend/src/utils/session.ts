/**
 * Session Helper Utilities
 *
 * Centralized session-related utilities used across controllers.
 */

import { prisma } from '../lib/prisma';

/**
 * Gets the partner's user ID from a session
 */
export async function getPartnerUserId(
  sessionId: string,
  currentUserId: string
): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const partnerMember = session.relationship.members.find(
    (m) => m.userId !== currentUserId
  );

  return partnerMember?.userId ?? null;
}

/**
 * Checks if a user is the creator of a session (the one who sent the invitation).
 * Used to allow the creator to work on Stages 0-1 while waiting for partner to accept.
 */
export async function isSessionCreator(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const invitation = await prisma.invitation.findFirst({
    where: {
      sessionId,
      invitedById: userId,
    },
  });

  return invitation !== null;
}
