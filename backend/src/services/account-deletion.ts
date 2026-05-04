/**
 * Account Deletion Service
 *
 * Handles complete account deletion including:
 * - Notifying partners in active sessions
 * - Marking sessions as abandoned
 * - Anonymizing shared content (preserving for remaining partner)
 * - Cleaning up private user data
 *
 * Key principles:
 * 1. Data shared with partner stays (content they've seen belongs to them too)
 * 2. Active sessions get ABANDONED status + partner notification
 * 3. Private data (inner work, vessels, drafts) gets deleted
 * 4. User references in shared content become null (anonymized)
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { publishSessionEvent } from './realtime';

export interface AccountDeletionSummary {
  sessionsAbandoned: number;
  partnersNotified: number;
  dataRecordsDeleted: number;
}

/**
 * Delete a user account with proper notifications and data handling.
 *
 * @param userId - The user ID to delete
 * @param displayName - The user's display name for notifications
 * @returns Summary of what was deleted/affected
 */
export async function deleteAccountWithNotifications(
  userId: string,
  displayName: string
): Promise<AccountDeletionSummary> {
  // Track what we're doing
  let sessionsAbandoned = 0;
  let partnersNotified = 0;
  let dataRecordsDeleted = 0;

  // Step 1: Find all active sessions where this user is a member
  const activeSessions = await prisma.session.findMany({
    where: {
      relationship: {
        members: {
          some: { userId },
        },
      },
      status: {
        in: ['CREATED', 'INVITED', 'ACTIVE', 'WAITING', 'PAUSED'],
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

  // Step 2: Mark active sessions as ABANDONED and notify partners
  for (const session of activeSessions) {
    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'ABANDONED' },
    });
    sessionsAbandoned++;

    // Notify partner that the session has been abandoned
    const partner = session.relationship.members.find((m: { userId: string }) => m.userId !== userId);
    if (partner) {
      try {
        await publishSessionEvent(session.id, 'session.abandoned', {
          reason: 'partner_deleted_account',
          partnerName: displayName,
        });
        partnersNotified++;
      } catch (error) {
        logger.warn(`[AccountDeletion] Failed to notify partner ${partner.userId}:`, { error });
      }
    }
  }

  // Step 3: Anonymize GlobalLibraryItem contributions (keep content, remove reference)
  const libraryUpdate = await prisma.globalLibraryItem.updateMany({
    where: { contributedBy: userId },
    data: { contributedBy: null },
  });
  dataRecordsDeleted += libraryUpdate.count;

  // Step 4: Clean up ReconcilerResult records (remove user references)
  // These store comparison data that references the deleted user
  await prisma.reconcilerResult.updateMany({
    where: { guesserId: userId },
    data: { guesserName: '[Deleted User]' },
  });
  await prisma.reconcilerResult.updateMany({
    where: { subjectId: userId },
    data: { subjectName: '[Deleted User]' },
  });

  // Step 5: Delete PreSessionMessages for this user
  const preSessionDelete = await prisma.preSessionMessage.deleteMany({
    where: { userId },
  });
  dataRecordsDeleted += preSessionDelete.count;

  // Step 6: Count data that will be cascade deleted
  // (These will be automatically deleted by Prisma cascades when we delete the user)
  const [
    innerWorkSessions,
    stageProgress,
    userVessels,
    empathyDrafts,
    strategyRankings,
    exerciseCompletions,
    consentRecords,
    invitations,
    relationshipMembers,
  ] = await Promise.all([
    prisma.innerWorkSession.count({ where: { userId } }),
    prisma.stageProgress.count({ where: { userId } }),
    prisma.userVessel.count({ where: { userId } }),
    prisma.empathyDraft.count({ where: { userId } }),
    prisma.strategyRanking.count({ where: { userId } }),
    prisma.emotionalExerciseCompletion.count({ where: { userId } }),
    prisma.consentRecord.count({ where: { userId } }),
    prisma.invitation.count({ where: { invitedById: userId } }),
    prisma.relationshipMember.count({ where: { userId } }),
  ]);

  dataRecordsDeleted +=
    innerWorkSessions +
    stageProgress +
    userVessels +
    empathyDrafts +
    strategyRankings +
    exerciseCompletions +
    consentRecords +
    invitations +
    relationshipMembers;

  // Step 7: Delete the user (Prisma cascades will handle related data)
  // The schema is configured with:
  // - onDelete: Cascade for user's private data (auto-deleted)
  // - onDelete: SetNull for shared content (anonymized, preserved for partner)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clerkId: true },
  });
  const clerkId = user?.clerkId;

  await prisma.user.delete({
    where: { id: userId },
  });

  // Add 1 for the user record itself
  dataRecordsDeleted += 1;

  // Step 8: Delete Clerk user (after Prisma delete so DB is clean even if Clerk fails)
  if (clerkId) {
    try {
      const { clerkClient } = await import('@clerk/express');
      await clerkClient.users.deleteUser(clerkId);
    } catch (error) {
      logger.error(`[AccountDeletion] Failed to delete Clerk user ${clerkId}:`, { error });
    }
  }

  return {
    sessionsAbandoned,
    partnersNotified,
    dataRecordsDeleted,
  };
}
