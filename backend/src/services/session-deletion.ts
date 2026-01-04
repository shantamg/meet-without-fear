/**
 * Session Deletion Service
 *
 * Handles session deletion for a single user, similar to account deletion but scoped to one session.
 *
 * Key principles:
 * 1. Data shared with partner stays (content they've seen belongs to them too)
 * 2. Active sessions become ABANDONED + partner notification
 * 3. Private user data for this session gets deleted (vessel, messages, stage progress, drafts)
 * 4. User references in shared content become null (anonymized)
 * 5. Partner keeps access to their own data and the session (in ABANDONED state)
 */

import { prisma } from '../lib/prisma';
import { createNotification } from './notification';

export interface SessionDeletionSummary {
  sessionAbandoned: boolean;
  partnerNotified: boolean;
  dataRecordsDeleted: number;
}

/**
 * Delete a user's participation in a session with proper notifications and data handling.
 *
 * @param sessionId - The session ID to delete from
 * @param userId - The user ID who is deleting
 * @param displayName - The user's display name for notifications
 * @returns Summary of what was deleted/affected
 */
export async function deleteSessionForUser(
  sessionId: string,
  userId: string,
  displayName: string
): Promise<SessionDeletionSummary> {
  let partnerNotified = false;
  let dataRecordsDeleted = 0;
  let sessionAbandoned = false;

  // Step 1: Find the session and verify user has access
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      relationship: {
        members: {
          some: { userId },
        },
      },
    },
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error('Session not found or access denied');
  }

  // Step 2: Find the partner (the other member)
  const partner = session.relationship.members.find((m) => m.userId !== userId);

  // Step 3: If session is active, mark as ABANDONED and notify partner
  const activeStatuses = ['CREATED', 'INVITED', 'ACTIVE', 'WAITING', 'PAUSED'];
  if (activeStatuses.includes(session.status)) {
    // Notify partner if they exist
    if (partner) {
      await createNotification({
        userId: partner.userId,
        type: 'SESSION_ABANDONED',
        sessionId: session.id,
        actorName: displayName,
      });
      partnerNotified = true;
    }

    // Mark session as abandoned
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ABANDONED' },
    });
    sessionAbandoned = true;
  } else {
    // For already resolved/abandoned sessions, just mark as archived from this user's perspective
    // The partner can still see it
    sessionAbandoned = session.status === 'ABANDONED';
  }

  // Step 4: Delete user's private data for this session

  // 4a: Delete user's stage progress
  const stageProgressDelete = await prisma.stageProgress.deleteMany({
    where: { sessionId, userId },
  });
  dataRecordsDeleted += stageProgressDelete.count;

  // 4b: Delete user's messages (their sent messages)
  // Note: We set senderId to null to anonymize rather than delete,
  // so partner can still see the conversation history
  const messageUpdate = await prisma.message.updateMany({
    where: { sessionId, senderId: userId },
    data: { senderId: null },
  });
  dataRecordsDeleted += messageUpdate.count;

  // Also delete AI messages that were specifically for this user
  const aiMessageDelete = await prisma.message.deleteMany({
    where: { sessionId, forUserId: userId },
  });
  dataRecordsDeleted += aiMessageDelete.count;

  // 4c: Delete user's vessel and all related data (cascades handle nested items)
  const userVessel = await prisma.userVessel.findFirst({
    where: { sessionId, userId },
  });
  if (userVessel) {
    await prisma.userVessel.delete({
      where: { id: userVessel.id },
    });
    dataRecordsDeleted += 1;
  }

  // 4d: Delete user's empathy drafts
  const empathyDraftDelete = await prisma.empathyDraft.deleteMany({
    where: { sessionId, userId },
  });
  dataRecordsDeleted += empathyDraftDelete.count;

  // 4e: Anonymize user's empathy attempts (keep for partner reference)
  await prisma.empathyAttempt.updateMany({
    where: { sessionId, sourceUserId: userId },
    data: { sourceUserId: null },
  });

  // 4f: Anonymize user's empathy validations
  await prisma.empathyValidation.updateMany({
    where: { sessionId, userId },
    data: { userId: null },
  });

  // 4g: Delete user's strategy rankings
  const strategyRankingDelete = await prisma.strategyRanking.deleteMany({
    where: { sessionId, userId },
  });
  dataRecordsDeleted += strategyRankingDelete.count;

  // 4h: Anonymize user's strategy proposals (keep for partner reference)
  await prisma.strategyProposal.updateMany({
    where: { sessionId, createdByUserId: userId },
    data: { createdByUserId: null },
  });

  // 4i: Delete user's emotional exercise completions
  const exerciseDelete = await prisma.emotionalExerciseCompletion.deleteMany({
    where: { sessionId, userId },
  });
  dataRecordsDeleted += exerciseDelete.count;

  // 4j: Delete user's consent records for this session
  const consentDelete = await prisma.consentRecord.deleteMany({
    where: { sessionId, userId },
  });
  dataRecordsDeleted += consentDelete.count;

  // 4k: Anonymize consented content from this user
  await prisma.consentedContent.updateMany({
    where: {
      sharedVessel: { sessionId },
      sourceUserId: userId,
    },
    data: { sourceUserId: null },
  });

  // 4l: Anonymize reconciler results
  await prisma.reconcilerResult.updateMany({
    where: { sessionId, guesserId: userId },
    data: { guesserName: '[Deleted User]' },
  });
  await prisma.reconcilerResult.updateMany({
    where: { sessionId, subjectId: userId },
    data: { subjectName: '[Deleted User]' },
  });

  // 4m: Delete notifications for this session that belong to this user
  const notificationDelete = await prisma.notification.deleteMany({
    where: { sessionId, userId },
  });
  dataRecordsDeleted += notificationDelete.count;

  // 4n: Delete invitations sent by this user for this session
  const invitationDelete = await prisma.invitation.deleteMany({
    where: { sessionId, invitedById: userId },
  });
  dataRecordsDeleted += invitationDelete.count;

  // Step 5: Remove user from the relationship membership for this session's relationship
  // Note: We don't delete the membership if there's a partner, as the relationship still exists
  // The partner can still see the session in their list
  // We only delete if this was a pending session with no partner
  if (!partner) {
    // No partner means this was a pending invitation that was never accepted
    // Safe to delete the relationship membership
    await prisma.relationshipMember.deleteMany({
      where: { relationshipId: session.relationshipId, userId },
    });
    dataRecordsDeleted += 1;
  }

  return {
    sessionAbandoned,
    partnerNotified,
    dataRecordsDeleted,
  };
}
