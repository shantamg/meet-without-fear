/**
 * Consolidated Session State Controller
 *
 * Single endpoint that returns core session data in one request.
 * Reduces initial load from 4+ requests to 1 for the base session view.
 *
 * GET /sessions/:id/state
 *
 * Returns:
 * - Session details
 * - Stage progress (both users)
 * - Messages (initial page)
 * - Invitation status
 * - Compact signing status
 *
 * Stage-specific data (empathy drafts, needs, strategies, agreements) are
 * still fetched via individual endpoints to avoid duplicating complex logic.
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ErrorCode } from '@meet-without-fear/shared';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';

// ============================================================================
// Types
// ============================================================================

interface CompactGates {
  compactSigned: boolean;
  signedAt?: string;
}

// ============================================================================
// Main Controller
// ============================================================================

/**
 * Get consolidated session state
 * GET /sessions/:id/state
 *
 * Returns core session data in a single request for efficient initial load.
 */
export async function getSessionState(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
      return;
    }

    const sessionId = req.params.id;

    // Fetch core session data in parallel
    const [sessionWithRelations, messages, userVessel] = await Promise.all([
      // 1. Session with all core relations
      prisma.session.findFirst({
        where: {
          id: sessionId,
          relationship: {
            members: {
              some: { userId: user.id },
            },
          },
        },
        include: {
          relationship: {
            include: {
              members: {
                select: {
                  userId: true,
                  nickname: true,
                  user: {
                    select: {
                      id: true,
                      name: true,
                      firstName: true,
                    },
                  },
                },
              },
            },
          },
          stageProgress: true,
          invitations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),

      // 2. Messages (initial page - 25 most recent for this user)
      // Uses data isolation: messages with forUserId only show to that specific user
      prisma.message.findMany({
        where: {
          sessionId,
          OR: [
            // Messages user sent without a specific recipient
            { senderId: user.id, forUserId: null },
            // Messages specifically for this user (AI, SHARED_CONTEXT, etc.)
            { forUserId: user.id },
            // EMPATHY_STATEMENT messages are visible to both users for mutual understanding
            { role: 'EMPATHY_STATEMENT' },
          ],
        },
        orderBy: { timestamp: 'desc' },
        take: 26, // Take 26 to check if there are more
      }),

      // 3. User's vessel for this session (for lastSeenChatItemId)
      prisma.userVessel.findUnique({
        where: {
          userId_sessionId: {
            userId: user.id,
            sessionId,
          },
        },
        select: {
          lastSeenChatItemId: true,
        },
      }),
    ]);

    // Check session exists
    if (!sessionWithRelations) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Session not found', 404);
      return;
    }

    const session = sessionWithRelations;
    const partnerId = await getPartnerUserId(sessionId, user.id);

    // Get my membership (for nickname I use for partner)
    const myMember = session.relationship.members.find(
      (m) => m.userId === user.id
    );
    const partnerMember = session.relationship.members.find(
      (m) => m.userId !== user.id
    );

    // Build progress response
    const myProgressRecord = session.stageProgress
      .filter((sp) => sp.userId === user.id)
      .sort((a, b) => b.stage - a.stage)[0];
    const partnerProgressRecord = partnerId
      ? session.stageProgress
          .filter((sp) => sp.userId === partnerId)
          .sort((a, b) => b.stage - a.stage)[0]
      : null;

    // Get Stage 1 record for milestones
    const myStage1Record = session.stageProgress.find(
      (sp) => sp.userId === user.id && sp.stage === 1
    );

    const defaultProgress = {
      stage: 0,
      status: 'NOT_STARTED' as const,
      startedAt: null,
      completedAt: null,
      gatesSatisfied: null,
    };

    const myProgress = myProgressRecord
      ? {
          stage: myProgressRecord.stage,
          status: myProgressRecord.status,
          startedAt: myProgressRecord.startedAt?.toISOString() ?? null,
          completedAt: myProgressRecord.completedAt?.toISOString() ?? null,
          gatesSatisfied: myProgressRecord.gatesSatisfied,
        }
      : defaultProgress;

    const partnerProgress = partnerProgressRecord
      ? {
          stage: partnerProgressRecord.stage,
          status: partnerProgressRecord.status,
          startedAt: partnerProgressRecord.startedAt?.toISOString() ?? null,
          completedAt: partnerProgressRecord.completedAt?.toISOString() ?? null,
        }
      : defaultProgress;

    // Extract milestones from Stage 1 gates
    const stage1Gates = myStage1Record?.gatesSatisfied as {
      feelHeardConfirmedAt?: string;
    } | null;
    const milestones = {
      feelHeardConfirmedAt: stage1Gates?.feelHeardConfirmedAt ?? null,
    };

    // Partner display name
    const partnerDisplayName =
      myMember?.nickname ||
      partnerMember?.user.firstName ||
      partnerMember?.user.name ||
      null;

    // Build messages response (reverse to chronological order)
    const hasMoreMessages = messages.length > 25;
    const messageSlice = hasMoreMessages ? messages.slice(0, 25) : messages;
    const messagesResponse = {
      messages: messageSlice.reverse().map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        senderId: m.senderId,
        role: m.role,
        content: m.content,
        stage: m.stage,
        timestamp: m.timestamp.toISOString(),
      })),
      hasMore: hasMoreMessages,
      cursor: hasMoreMessages ? messageSlice[0]?.id : undefined,
    };

    // Build invitation response
    const invitation = session.invitations[0];
    const isInviter = invitation?.invitedById === user.id;
    const invitationResponse = invitation
      ? {
          id: invitation.id,
          sessionId: invitation.sessionId,
          invitedBy: {
            id: invitation.invitedById,
            name: null as string | null,
          },
          status: invitation.status,
          createdAt: invitation.createdAt.toISOString(),
          expiresAt: invitation.expiresAt.toISOString(),
          invitationMessage: invitation.invitationMessage,
          messageConfirmed: invitation.messageConfirmed,
          messageConfirmedAt: invitation.messageConfirmedAt?.toISOString() ?? null,
          acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
          isInviter,
        }
      : null;

    // Build compact status from Stage 0 progress gatesSatisfied
    const myStage0Record = session.stageProgress.find(
      (sp) => sp.userId === user.id && sp.stage === 0
    );
    const partnerStage0Record = partnerId
      ? session.stageProgress.find(
          (sp) => sp.userId === partnerId && sp.stage === 0
        )
      : null;

    const myGates = myStage0Record?.gatesSatisfied as CompactGates | null;
    const partnerGates = partnerStage0Record?.gatesSatisfied as CompactGates | null;

    const compactResponse = {
      mySigned: myGates?.compactSigned ?? false,
      mySignedAt: myGates?.signedAt ?? null,
      partnerSigned: partnerGates?.compactSigned ?? false,
      partnerSignedAt: partnerGates?.signedAt ?? null,
      canAdvance: (myGates?.compactSigned ?? false) && ((partnerGates?.compactSigned ?? false) || !partnerId),
    };

    // Return consolidated response
    successResponse(res, {
      // Core session data
      session: {
        id: session.id,
        status: session.status,
        currentStage: myProgress.stage,
        stageStatus: myProgress.status,
        relationshipId: session.relationshipId,
        partner: partnerMember
          ? {
              id: partnerMember.userId,
              name: partnerDisplayName,
              nickname: myMember?.nickname || null,
            }
          : { id: '', name: myMember?.nickname || null, nickname: myMember?.nickname || null },
        myProgress: {
          stage: myProgress.stage,
          status: myProgress.status,
        },
        createdAt: session.createdAt.toISOString(),
        resolvedAt: session.resolvedAt?.toISOString() ?? null,
        lastSeenChatItemId: userVessel?.lastSeenChatItemId ?? null,
      },

      // Stage progress
      progress: {
        sessionId,
        myProgress,
        partnerProgress,
        canAdvance: myProgress.status === 'COMPLETED' || myProgress.stage === 0,
        milestones,
      },

      // Messages (initial page)
      messages: messagesResponse,

      // Stage 0: Invitation and Compact
      invitation: invitationResponse,
      compact: compactResponse,
    });
  } catch (error) {
    console.error('[getSessionState] Error:', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get session state', 500);
  }
}
