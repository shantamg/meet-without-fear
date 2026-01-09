/**
 * Session Helper Utilities
 *
 * Centralized session-related utilities used across controllers.
 */

import { prisma } from '../lib/prisma';
import {
  SessionSummaryDTO,
  SessionStatusSummary,
  StageProgressDTO,
  SessionStatus,
  Stage,
  StageStatus,
  STAGE_NAMES,
} from '@meet-without-fear/shared';

// Type for session with includes (from Prisma)
type SessionWithIncludes = {
  id: string;
  relationshipId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  relationship: {
    members: Array<{
      userId: string;
      nickname: string | null;
      user: {
        id: string;
        name: string | null;
        firstName: string | null;
      };
    }>;
  };
  stageProgress: Array<{
    userId: string;
    stage: number;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    gatesSatisfied?: unknown;
  }>;
  // Optional: empathy attempts for Stage 2 status display
  empathyAttempts?: Array<{
    sourceUserId: string | null;
  }>;
  // Optional: user vessel for read state tracking
  userVessels?: Array<{
    userId: string;
    lastViewedAt: Date | null;
    lastSeenChatItemId: string | null;
  }>;
};

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

/**
 * Options for status summary generation
 */
interface StatusSummaryOptions {
  /** Whether the current user has sent their empathy (EmpathyAttempt exists) */
  userHasSentEmpathy?: boolean;
  /** Whether the partner has sent their empathy (EmpathyAttempt exists) */
  partnerHasSentEmpathy?: boolean;
}

/**
 * Generate human-readable status summary for session list display.
 *
 * This function creates contextual messages about:
 * 1. What the user has done / where they are
 * 2. What's happening with the partner
 *
 * Examples:
 * - "You've shared your perspective" / "Waiting for Jason to share theirs"
 * - "You're working on The Witness" / "Jason is still getting started"
 * - "Invitation sent" / "Waiting for them to join"
 */
export function generateSessionStatusSummary(
  sessionStatus: SessionStatus,
  myProgress: StageProgressDTO,
  partnerProgress: StageProgressDTO,
  partnerName: string,
  options: StatusSummaryOptions = {}
): SessionStatusSummary {
  const name = partnerName || 'Partner';

  // Handle non-active session statuses first
  if (sessionStatus === SessionStatus.CREATED) {
    return {
      userStatus: 'Draft invitation',
      partnerStatus: 'Not sent yet',
    };
  }

  if (sessionStatus === SessionStatus.INVITED) {
    // Check if partner has actually joined and made progress
    // (This handles cases where session status wasn't updated but partner has progress)
    const hasPartnerProgress =
      partnerProgress.stage > Stage.ONBOARDING ||
      partnerProgress.status === StageStatus.IN_PROGRESS ||
      partnerProgress.status === StageStatus.GATE_PENDING ||
      partnerProgress.status === StageStatus.COMPLETED;

    // If partner has made progress, treat as active session
    if (hasPartnerProgress) {
      // Fall through to active session logic below
    } else {
      // Partner hasn't joined yet - show invitation status
      // Check if creator has made progress while waiting for partner to accept
      const hasUserProgress =
        myProgress.stage > Stage.ONBOARDING ||
        myProgress.status === StageStatus.IN_PROGRESS ||
        myProgress.status === StageStatus.GATE_PENDING ||
        myProgress.status === StageStatus.COMPLETED;

      if (hasUserProgress) {
        // Show actual progress status for creator, partner is still pending acceptance
        const userStatus =
          myProgress.status === StageStatus.IN_PROGRESS
            ? getInProgressStageMessage(myProgress.stage, options.userHasSentEmpathy)
            : myProgress.status === StageStatus.GATE_PENDING ||
                myProgress.status === StageStatus.COMPLETED
              ? getCompletedStageMessage(myProgress.stage)
              : `Ready to start ${STAGE_NAMES[myProgress.stage]}`;

        return {
          userStatus,
          partnerStatus: `Waiting for ${name} to join`,
        };
      }

      return {
        userStatus: 'Invitation sent',
        partnerStatus: `Waiting for ${name} to join`,
      };
    }
  }

  if (sessionStatus === SessionStatus.PAUSED) {
    return {
      userStatus: 'Session paused',
      partnerStatus: 'Take a break and return when ready',
    };
  }

  if (sessionStatus === SessionStatus.RESOLVED) {
    return {
      userStatus: 'Session complete',
      partnerStatus: 'You both reached resolution',
    };
  }

  if (sessionStatus === SessionStatus.ABANDONED) {
    return {
      userStatus: 'Session ended',
      partnerStatus: 'This conversation was not completed',
    };
  }

  // For active/waiting sessions, generate stage-specific messages
  const myStage = myProgress.stage;
  const myStatus = myProgress.status;
  const partnerStage = partnerProgress.stage;
  const partnerStatus = partnerProgress.status;

  // Get user-friendly stage names
  const myStageName = STAGE_NAMES[myStage];

  // Generate user status based on their progress
  let userStatus: string;
  switch (myStatus) {
    case StageStatus.NOT_STARTED:
      userStatus = `Ready to start ${myStageName}`;
      break;
    case StageStatus.IN_PROGRESS:
      userStatus = getInProgressStageMessage(myStage, options.userHasSentEmpathy);
      break;
    case StageStatus.GATE_PENDING:
      userStatus = getCompletedStageMessage(myStage);
      break;
    case StageStatus.COMPLETED:
      userStatus = getCompletedStageMessage(myStage);
      break;
    default:
      userStatus = `On ${myStageName}`;
  }

  // Generate partner status based on their progress
  let partnerStatusMsg: string;

  // If partner is behind
  if (partnerStage < myStage) {
    const partnerStageName = STAGE_NAMES[partnerStage];
    if (partnerStatus === StageStatus.NOT_STARTED) {
      partnerStatusMsg = `${name} hasn't started ${partnerStageName} yet`;
    } else if (partnerStatus === StageStatus.IN_PROGRESS) {
      partnerStatusMsg = `${name} is working on ${partnerStageName}`;
    } else {
      partnerStatusMsg = `Waiting for ${name} to catch up`;
    }
  }
  // If partner is on the same stage
  else if (partnerStage === myStage) {
    if (partnerStatus === StageStatus.GATE_PENDING || partnerStatus === StageStatus.COMPLETED) {
      // Both ready to advance
      partnerStatusMsg = `${name} is also ready`;
    } else if (partnerStatus === StageStatus.NOT_STARTED) {
      partnerStatusMsg = `Waiting for ${name} to start`;
    } else {
      partnerStatusMsg = getWaitingForPartnerMessage(myStage, name);
    }
  }
  // If partner is ahead (user is behind)
  else {
    partnerStatusMsg = `${name} is waiting for you`;
    // Update user status to reflect they need to catch up
    if (myStatus === StageStatus.NOT_STARTED) {
      userStatus = `${name} is ahead - start ${myStageName}`;
    } else if (myStatus === StageStatus.IN_PROGRESS) {
      userStatus = `Keep going on ${myStageName}`;
    }
  }

  return {
    userStatus,
    partnerStatus: partnerStatusMsg,
  };
}

/**
 * Get a message describing what the user is currently doing in their stage.
 * @param stage - The current stage
 * @param hasSentEmpathy - For Stage 2, whether the user has already sent their empathy message
 */
function getInProgressStageMessage(stage: Stage, hasSentEmpathy?: boolean): string {
  switch (stage) {
    case Stage.ONBOARDING:
      return "Reviewing the compact";
    case Stage.WITNESS:
      return "Sharing your story";
    case Stage.PERSPECTIVE_STRETCH:
      // If user has sent empathy, show that instead of "crafting"
      return hasSentEmpathy ? "You've sent your empathy message" : "Crafting your empathy";
    case Stage.NEED_MAPPING:
      return "Identifying your needs";
    case Stage.STRATEGIC_REPAIR:
      return "Proposing strategies";
    default:
      return 'Working on current stage';
  }
}

/**
 * Get a message describing what the user has completed for their current stage.
 */
function getCompletedStageMessage(stage: Stage): string {
  switch (stage) {
    case Stage.ONBOARDING:
      return "You've signed the compact";
    case Stage.WITNESS:
      return "You've shared your story";
    case Stage.PERSPECTIVE_STRETCH:
      return "You've shared your empathy";
    case Stage.NEED_MAPPING:
      return "You've identified your needs";
    case Stage.STRATEGIC_REPAIR:
      return "You've proposed strategies";
    default:
      return 'Stage complete';
  }
}

/**
 * Get a message about waiting for partner based on the current stage.
 */
function getWaitingForPartnerMessage(stage: Stage, partnerName: string): string {
  switch (stage) {
    case Stage.ONBOARDING:
      return `Waiting for ${partnerName} to sign`;
    case Stage.WITNESS:
      return `Waiting for ${partnerName} to share`;
    case Stage.PERSPECTIVE_STRETCH:
      return `Waiting for ${partnerName}'s empathy`;
    case Stage.NEED_MAPPING:
      return `Waiting for ${partnerName}'s needs`;
    case Stage.STRATEGIC_REPAIR:
      return `Waiting for ${partnerName}'s input`;
    default:
      return `Waiting for ${partnerName}`;
  }
}

/**
 * Map a session with includes to a SessionSummaryDTO
 */
export function mapSessionToSummary(
  session: SessionWithIncludes,
  currentUserId: string
): SessionSummaryDTO {
  // Find partner member
  const partnerMember = session.relationship.members.find(
    (m) => m.userId !== currentUserId
  );
  const myMember = session.relationship.members.find(
    (m) => m.userId === currentUserId
  );

  // Find progress for each user
  const myProgressRecords = session.stageProgress.filter(
    (p) => p.userId === currentUserId
  );
  const partnerProgressRecords = session.stageProgress.filter(
    (p) => p.userId !== currentUserId
  );

  // Get current stage progress (highest stage)
  const myCurrentProgress = myProgressRecords.reduce(
    (max, p) => (p.stage > (max?.stage ?? -1) ? p : max),
    myProgressRecords[0]
  );
  const partnerCurrentProgress = partnerProgressRecords.reduce(
    (max, p) => (p.stage > (max?.stage ?? -1) ? p : max),
    partnerProgressRecords[0]
  );

  const myProgress: StageProgressDTO = myCurrentProgress
    ? {
        stage: myCurrentProgress.stage as Stage,
        status: myCurrentProgress.status as StageStatus,
        startedAt: myCurrentProgress.startedAt.toISOString(),
        completedAt: myCurrentProgress.completedAt?.toISOString() ?? null,
      }
    : {
        stage: Stage.ONBOARDING,
        status: StageStatus.NOT_STARTED,
        startedAt: null,
        completedAt: null,
      };

  const partnerProgress: StageProgressDTO = partnerCurrentProgress
    ? {
        stage: partnerCurrentProgress.stage as Stage,
        status: partnerCurrentProgress.status as StageStatus,
        startedAt: partnerCurrentProgress.startedAt.toISOString(),
        completedAt: partnerCurrentProgress.completedAt?.toISOString() ?? null,
      }
    : {
        stage: Stage.ONBOARDING,
        status: StageStatus.NOT_STARTED,
        startedAt: null,
        completedAt: null,
      };

  // Compute action needed based on gates (kept for backwards compatibility)
  const selfActionNeeded: string[] = [];
  const partnerActionNeeded: string[] = [];

  // Simplified action computation - could be enhanced based on gate status
  if (myProgress.status === StageStatus.NOT_STARTED) {
    selfActionNeeded.push('start_stage');
  }
  if (
    myProgress.status === StageStatus.GATE_PENDING &&
    partnerProgress.status !== StageStatus.COMPLETED
  ) {
    partnerActionNeeded.push('complete_stage');
  }

  // Get partner display name (prefer nickname, then firstName, then name)
  const partnerDisplayName =
    myMember?.nickname ??
    partnerMember?.user.firstName ??
    partnerMember?.user.name ??
    'Partner';

  // Check for empathy attempts (if included in query)
  const userHasSentEmpathy = session.empathyAttempts?.some(
    (a) => a.sourceUserId === currentUserId
  ) ?? false;
  const partnerHasSentEmpathy = session.empathyAttempts?.some(
    (a) => a.sourceUserId !== currentUserId
  ) ?? false;

  // Generate human-readable status summary
  const statusSummary = generateSessionStatusSummary(
    session.status as SessionStatus,
    myProgress,
    partnerProgress,
    partnerDisplayName,
    { userHasSentEmpathy, partnerHasSentEmpathy }
  );

  // Get user's read state from UserVessel (if included)
  const userVessel = session.userVessels?.find((v) => v.userId === currentUserId);
  const lastViewedAt = userVessel?.lastViewedAt ?? null;
  const lastSeenChatItemId = userVessel?.lastSeenChatItemId ?? null;

  // Determine if there's unread content:
  // - If never viewed (lastViewedAt is null), consider unread if session has any activity
  // - If viewed, compare session's updatedAt with lastViewedAt
  const hasUnread = lastViewedAt === null
    ? session.status !== SessionStatus.CREATED // Unread if not a fresh draft
    : session.updatedAt > lastViewedAt;

  return {
    id: session.id,
    relationshipId: session.relationshipId,
    status: session.status as SessionStatus,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    partner: {
      id: partnerMember?.userId ?? '',
      name: partnerMember?.user.firstName ?? partnerMember?.user.name ?? null,
      nickname: myMember?.nickname ?? null, // What I call my partner
    },
    myProgress,
    partnerProgress,
    statusSummary,
    selfActionNeeded,
    partnerActionNeeded,
    hasUnread,
    lastViewedAt: lastViewedAt?.toISOString() ?? null,
    lastSeenChatItemId,
  };
}
