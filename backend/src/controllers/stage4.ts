/**
 * Stage 4 Controller
 *
 * Handles the Strategic Repair stage endpoints:
 * - GET /sessions/:id/strategies - Get anonymous strategy pool
 * - POST /sessions/:id/strategies - Propose a strategy
 * - POST /sessions/:id/strategies/rank - Submit ranking
 * - GET /sessions/:id/strategies/overlap - Get ranking overlap
 * - POST /sessions/:id/agreements - Create agreement
 * - POST /sessions/:id/agreements/:agreementId/confirm - Confirm agreement
 */

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import {
  proposeStrategyRequestSchema,
  rankStrategiesRequestSchema,
  confirmAgreementRequestSchema,
  AgreementType,
  ApiResponse,
  ErrorCode,
  StrategyPhase,
  MAX_AGREEMENTS,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';
import { notifyPartner, publishSessionEvent } from '../services/realtime';
import { successResponse, errorResponse } from '../utils/response';
import { getPartnerUserId } from '../utils/session';
import { getStage4State as buildStage4State, Stage4StateNotFoundError } from '../services/stage4-state';
import { scheduleSharedAgreementTendingEntries } from '../services/tending.service';
import { z } from 'zod';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determine which user slot (A or B) a user occupies in a session
 */
async function getUserSlot(
  sessionId: string,
  userId: string
): Promise<'A' | 'B' | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            orderBy: { joinedAt: 'asc' },
          },
        },
      },
    },
  });

  if (!session) return null;

  const members = session.relationship.members;
  if (members.length < 2) return null;

  // First member is A, second is B
  if (members[0].userId === userId) return 'A';
  if (members[1].userId === userId) return 'B';

  return null;
}

/**
 * Shuffle array for random ordering
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

type StrategyProposalForVisibility = {
  id: string;
  description: string;
  needsAddressed: string[];
  duration: string | null;
  measureOfSuccess: string | null;
  createdByUserId: string | null;
};

function toStrategyDTO(strategy: StrategyProposalForVisibility) {
  return {
    id: strategy.id,
    description: strategy.description,
    needsAddressed: strategy.needsAddressed,
    duration: strategy.duration,
    measureOfSuccess: strategy.measureOfSuccess,
  };
}

// Create agreement request schema locally
const createAgreementRequestSchema = z.object({
  strategyId: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  type: z.nativeEnum(AgreementType),
  duration: z.string().optional(),
  measureOfSuccess: z.string().optional(),
  followUpDate: z.string().optional(),
});

const stage4SelectionDecisionSchema = z.nativeEnum(Stage4SelectionDecision);

const submitStage4SelectionRequestSchema = z.object({
  decision: stage4SelectionDecisionSchema,
  note: z.string().max(1000).optional(),
});

const submitStage4SelectionsRequestSchema = z.object({
  selections: z
    .array(
      z.object({
        proposalId: z.string().min(1, 'Proposal ID is required'),
        decision: stage4SelectionDecisionSchema,
        note: z.string().max(1000).optional(),
      })
    )
    .min(1, 'At least one selection is required'),
});

const closeStage4RequestSchema = z.object({
  kind: z.nativeEnum(Stage4ClosureKind).optional(),
  reason: z.nativeEnum(Stage4ClosureReason).optional(),
  summary: z.string().max(2000).optional(),
  followUpDatesByProposalId: z.record(z.string()).optional(),
});

type Stage4MutableSession = {
  id: string;
  status: string;
  relationship: {
    members: Array<{ userId: string; joinedAt: Date }>;
  };
};

type Stage4ProposalForClosure = {
  id: string;
  sessionId: string;
  description: string;
  duration: string | null;
  measureOfSuccess: string | null;
  kind: Stage4ProposalKind;
  status: Stage4ProposalStatus;
  createdByUserId: string | null;
};

type Stage4SelectionForClosure = {
  proposalId: string;
  userId: string;
  decision: Stage4SelectionDecision;
};

type Stage4CoverageForClosure = {
  id: string;
  needId: string | null;
  coverageStatus: string;
};

async function getMutableStage4Session(
  sessionId: string,
  userId: string
): Promise<{ session: Stage4MutableSession; progress: { gatesSatisfied: Prisma.JsonValue | null } | null } | null> {
  const session = (await prisma.session.findFirst({
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
            orderBy: { joinedAt: 'asc' },
          },
        },
      },
    },
  })) as Stage4MutableSession | null;

  if (!session) return null;

  const progress = await prisma.stageProgress.findFirst({
    where: {
      sessionId,
      userId,
      status: 'IN_PROGRESS',
    },
    orderBy: { stage: 'desc' },
    select: { gatesSatisfied: true },
  });

  return { session, progress };
}

async function markStage4SelectionSubmitted(
  sessionId: string,
  userId: string,
  existingGates: Prisma.JsonValue | null | undefined
): Promise<void> {
  const gatesSatisfied = {
    ...((existingGates as Record<string, unknown> | null) || {}),
    selectionSubmitted: true,
    selectionSubmittedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonValue;

  await prisma.stageProgress.update({
    where: {
      sessionId_userId_stage: { sessionId, userId, stage: 4 },
    },
    data: { gatesSatisfied },
  });
}

function userIsSessionMember(session: Stage4MutableSession, userId: string): boolean {
  return session.relationship.members.some((member) => member.userId === userId);
}

function selectionsByProposalAndUser(
  selections: Stage4SelectionForClosure[]
): Map<string, Map<string, Stage4SelectionForClosure>> {
  const byProposal = new Map<string, Map<string, Stage4SelectionForClosure>>();
  for (const selection of selections) {
    const byUser = byProposal.get(selection.proposalId) ?? new Map<string, Stage4SelectionForClosure>();
    byUser.set(selection.userId, selection);
    byProposal.set(selection.proposalId, byUser);
  }
  return byProposal;
}

function bothPartnersWilling(
  proposalId: string,
  session: Stage4MutableSession,
  selectionsByProposal: Map<string, Map<string, Stage4SelectionForClosure>>
): boolean {
  const proposalSelections = selectionsByProposal.get(proposalId);
  if (!proposalSelections) return false;

  return session.relationship.members.every(
    (member) => proposalSelections.get(member.userId)?.decision === Stage4SelectionDecision.WILLING
  );
}

function requiresSharedSelection(proposal: Stage4ProposalForClosure): boolean {
  return proposal.kind === Stage4ProposalKind.SHARED_PROPOSAL && proposal.status === Stage4ProposalStatus.ACTIVE;
}

function getWillingIndividualCommitmentIds(
  proposals: Stage4ProposalForClosure[],
  selections: Stage4SelectionForClosure[]
): string[] {
  return proposals
    .filter((proposal) => proposal.kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT)
    .filter((proposal) =>
      selections.some(
        (selection) =>
          selection.proposalId === proposal.id &&
          selection.decision === Stage4SelectionDecision.WILLING &&
          (!proposal.createdByUserId || proposal.createdByUserId === selection.userId)
      )
    )
    .map((proposal) => proposal.id);
}

function buildClosureSummary(
  kind: Stage4ClosureKind,
  mutualProposalCount: number,
  individualCommitmentCount: number,
  openNeedCount: number,
  requestedSummary?: string
): string {
  if (requestedSummary) return requestedSummary;

  if (kind === Stage4ClosureKind.SHARED_AGREEMENT) {
    return `Closed with ${mutualProposalCount} shared agreement${mutualProposalCount === 1 ? '' : 's'} and ${individualCommitmentCount} individual commitment${individualCommitmentCount === 1 ? '' : 's'}.`;
  }

  return `Closed without a shared agreement, preserving ${individualCommitmentCount} individual commitment${individualCommitmentCount === 1 ? '' : 's'} and ${openNeedCount} still-open need${openNeedCount === 1 ? '' : 's'}.`;
}

// ============================================================================
// Controllers
// ============================================================================

/**
 * Get redesigned Stage 4 state for proposal inventory, coverage, selections,
 * outcome, and Tending preview.
 * GET /sessions/:id/stage4
 */
export async function getStage4State(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const state = await buildStage4State(sessionId, user.id);

    successResponse(res, state);
  } catch (error) {
    if (error instanceof Stage4StateNotFoundError) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    logger.error('[getStage4State] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get Stage 4 state', 500);
  }
}

/**
 * Submit one redesigned Stage 4 per-proposal willingness decision.
 * POST /sessions/:id/stage4/proposals/:proposalId/selection
 */
export async function submitStage4ProposalSelection(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId, proposalId } = req.params;
    const parseResult = submitStage4SelectionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    await submitStage4SelectionsInternal(
      req,
      res,
      sessionId,
      user.id,
      [{ proposalId, ...parseResult.data }]
    );
  } catch (error) {
    logger.error('[submitStage4ProposalSelection] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to submit Stage 4 selection', 500);
  }
}

/**
 * Submit redesigned Stage 4 per-proposal willingness decisions.
 * POST /sessions/:id/stage4/selections
 */
export async function submitStage4Selections(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const parseResult = submitStage4SelectionsRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    await submitStage4SelectionsInternal(req, res, sessionId, user.id, parseResult.data.selections);
  } catch (error) {
    logger.error('[submitStage4Selections] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to submit Stage 4 selections', 500);
  }
}

async function submitStage4SelectionsInternal(
  req: Request,
  res: Response,
  sessionId: string,
  userId: string,
  selections: Array<{ proposalId: string; decision: Stage4SelectionDecision; note?: string }>
): Promise<void> {
  const mutable = await getMutableStage4Session(sessionId, userId);
  if (!mutable) {
    errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
    return;
  }

  if (mutable.session.status !== 'ACTIVE') {
    errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
    return;
  }

  const currentStage = await prisma.stageProgress.findFirst({
    where: { sessionId, userId, status: 'IN_PROGRESS' },
    orderBy: { stage: 'desc' },
  });
  if ((currentStage?.stage ?? 0) !== 4) {
    errorResponse(
      res,
      'VALIDATION_ERROR',
      `Cannot submit Stage 4 selections: you are in stage ${currentStage?.stage ?? 0}, but stage 4 is required`,
      400
    );
    return;
  }

  const existingClosure = await prisma.stage4Closure.findUnique({ where: { sessionId } });
  if (existingClosure) {
    errorResponse(res, 'CONFLICT', 'Stage 4 is already closed', 409);
    return;
  }

  const uniqueProposalIds = [...new Set(selections.map((selection) => selection.proposalId))];
  if (uniqueProposalIds.length !== selections.length) {
    errorResponse(res, 'VALIDATION_ERROR', 'Proposal selections must be unique per request', 400);
    return;
  }

  const proposals = await prisma.strategyProposal.findMany({
    where: {
      sessionId,
      id: { in: uniqueProposalIds },
      status: Stage4ProposalStatus.ACTIVE,
    },
    select: { id: true },
  });
  const validProposalIds = new Set(proposals.map((proposal) => proposal.id));
  if (uniqueProposalIds.some((proposalId) => !validProposalIds.has(proposalId))) {
    errorResponse(res, 'VALIDATION_ERROR', 'Selections must reference active proposals in this session', 400);
    return;
  }

  const submittedAt = new Date();
  await prisma.$transaction(
    selections.map((selection) =>
      prisma.stage4ProposalSelection.upsert({
        where: {
          proposalId_userId: {
            proposalId: selection.proposalId,
            userId,
          },
        },
        create: {
          proposalId: selection.proposalId,
          sessionId,
          userId,
          decision: selection.decision,
          note: selection.note,
          selectedAt: submittedAt,
        },
        update: {
          decision: selection.decision,
          note: selection.note,
          selectedAt: submittedAt,
        },
      })
    )
  );

  await markStage4SelectionSubmitted(sessionId, userId, mutable.progress?.gatesSatisfied);

  const partnerId = await getPartnerUserId(sessionId, userId);
  const partnerSubmitted = partnerId
    ? (await prisma.stage4ProposalSelection.count({ where: { sessionId, userId: partnerId } })) > 0
    : false;

  if (partnerId) {
    await notifyPartner(sessionId, partnerId, 'session.strategies_updated', {
      stage: 4,
      submittedBy: userId,
      change: 'stage4_selection_submitted',
    });
  }

  const state = await buildStage4State(sessionId, userId);
  successResponse(res, {
    submitted: true,
    submittedAt: submittedAt.toISOString(),
    partnerSubmitted,
    state,
  });
}

/**
 * Close redesigned Stage 4 from willingness selections.
 * POST /sessions/:id/stage4/close
 */
export async function closeStage4(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const parseResult = closeStage4RequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parseResult.error.issues);
      return;
    }

    const mutable = await getMutableStage4Session(sessionId, user.id);
    if (!mutable) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    if (mutable.session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    const currentStage = await prisma.stageProgress.findFirst({
      where: { sessionId, userId: user.id, status: 'IN_PROGRESS' },
      orderBy: { stage: 'desc' },
    });
    if ((currentStage?.stage ?? 0) !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot close Stage 4: you are in stage ${currentStage?.stage ?? 0}, but stage 4 is required`,
        400
      );
      return;
    }

    if (await prisma.stage4Closure.findUnique({ where: { sessionId } })) {
      errorResponse(res, 'CONFLICT', 'Stage 4 is already closed', 409);
      return;
    }

    const [proposals, selections, coverageRows, sharedVessel] = await Promise.all([
      prisma.strategyProposal.findMany({
        where: { sessionId, status: { not: Stage4ProposalStatus.REMOVED } },
        select: {
          id: true,
          sessionId: true,
          description: true,
          duration: true,
          measureOfSuccess: true,
          kind: true,
          status: true,
          createdByUserId: true,
        },
      }) as Promise<Stage4ProposalForClosure[]>,
      prisma.stage4ProposalSelection.findMany({
        where: { sessionId },
        select: { proposalId: true, userId: true, decision: true },
      }) as Promise<Stage4SelectionForClosure[]>,
      prisma.stage4NeedCoverage.findMany({
        where: { sessionId },
        select: { id: true, needId: true, coverageStatus: true },
      }) as Promise<Stage4CoverageForClosure[]>,
      prisma.sharedVessel.findUnique({ where: { sessionId } }),
    ]);

    if (!sharedVessel) {
      errorResponse(res, 'NOT_FOUND', 'Shared vessel not found', 404);
      return;
    }

    const selectionUserIds = new Set(selections.map((selection) => selection.userId));
    const bothPartnersSubmitted = mutable.session.relationship.members.every((member) =>
      selectionUserIds.has(member.userId)
    );
    const selectionsByProposal = selectionsByProposalAndUser(selections);
    const mutuallyWillingSharedProposals = proposals
      .filter(requiresSharedSelection)
      .filter((proposal) => bothPartnersWilling(proposal.id, mutable.session, selectionsByProposal))
      .slice(0, MAX_AGREEMENTS);
    const individualProposalIds = getWillingIndividualCommitmentIds(proposals, selections);
    const openNeedIds = coverageRows
      .filter((row) => row.coverageStatus === 'OPEN' || row.coverageStatus === 'PARTIAL')
      .map((row) => row.needId ?? row.id);

    const requestedKind = parseResult.data.kind;
    const closureKind =
      requestedKind ??
      (mutuallyWillingSharedProposals.length > 0 && bothPartnersSubmitted
        ? Stage4ClosureKind.SHARED_AGREEMENT
        : Stage4ClosureKind.NO_SHARED_AGREEMENT);

    if (closureKind === Stage4ClosureKind.SHARED_AGREEMENT) {
      if (!bothPartnersSubmitted) {
        errorResponse(res, 'VALIDATION_ERROR', 'Both partners must submit selections before shared agreement closure', 400);
        return;
      }
      if (mutuallyWillingSharedProposals.length === 0) {
        errorResponse(res, 'VALIDATION_ERROR', 'No mutually willing shared proposals are available to close', 400);
        return;
      }
    }

    if (
      closureKind === Stage4ClosureKind.NO_SHARED_AGREEMENT &&
      mutuallyWillingSharedProposals.length > 0 &&
      parseResult.data.reason !== Stage4ClosureReason.BOUNDARY_HONORED &&
      parseResult.data.reason !== Stage4ClosureReason.USER_STOPPED
    ) {
      errorResponse(res, 'VALIDATION_ERROR', 'Mutual willingness exists; no-shared-agreement closure requires an explicit boundary or stop reason', 400);
      return;
    }

    const now = new Date();
    const closureReason =
      parseResult.data.reason ??
      (closureKind === Stage4ClosureKind.SHARED_AGREEMENT
        ? Stage4ClosureReason.MUTUAL_SELECTION
        : bothPartnersSubmitted
          ? Stage4ClosureReason.NO_OVERLAP
          : Stage4ClosureReason.USER_STOPPED);
    const summary = buildClosureSummary(
      closureKind,
      mutuallyWillingSharedProposals.length,
      individualProposalIds.length,
      openNeedIds.length,
      parseResult.data.summary
    );

    const agreementIds = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdAgreementIds: string[] = [];
      const agreementsForTending: Array<{
        id: string;
        description: string;
        followUpDate: Date | null;
      }> = [];

      if (closureKind === Stage4ClosureKind.SHARED_AGREEMENT) {
        for (const proposal of mutuallyWillingSharedProposals) {
          const followUpDate = parseResult.data.followUpDatesByProposalId?.[proposal.id];
          const parsedFollowUpDate = followUpDate ? new Date(followUpDate) : null;
          const agreement = await tx.agreement.create({
            data: {
              sharedVesselId: sharedVessel.id,
              proposalId: proposal.id,
              description: proposal.description,
              type: AgreementType.MICRO_EXPERIMENT,
              duration: proposal.duration,
              measureOfSuccess: proposal.measureOfSuccess,
              followUpDate: parsedFollowUpDate,
              status: 'AGREED',
              agreedByA: true,
              agreedByB: true,
              agreedAt: now,
            },
          });
          createdAgreementIds.push(agreement.id);
          agreementsForTending.push({
            id: agreement.id,
            description: proposal.description,
            followUpDate: parsedFollowUpDate,
          });

          await tx.strategyProposal.update({
            where: { id: proposal.id },
            data: { status: Stage4ProposalStatus.CONVERTED_TO_AGREEMENT },
          });

          await tx.stage4ProposalRevision.create({
            data: {
              proposalId: proposal.id,
              sessionId,
              actorUserId: user.id,
              action: 'CONVERTED',
              before: { status: proposal.status },
              after: { agreementId: agreement.id, status: Stage4ProposalStatus.CONVERTED_TO_AGREEMENT },
              reason: 'Mutual Stage 4 willingness closure',
            },
          });
        }

        await scheduleSharedAgreementTendingEntries(tx, sessionId, agreementsForTending, now);
      }

      await tx.stage4Closure.create({
        data: {
          sessionId,
          kind: closureKind,
          reason: closureReason,
          summary,
          sharedAgreementIds: createdAgreementIds,
          individualProposalIds,
          openNeedIds,
          closedByUserId: user.id,
          closedAt: now,
        },
      });

      await tx.session.update({
        where: { id: sessionId },
        data: { status: 'RESOLVED', resolvedAt: now },
      });

      await tx.stageProgress.updateMany({
        where: { sessionId, completedAt: null },
        data: { status: 'COMPLETED', completedAt: now },
      });

      return createdAgreementIds;
    });

    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId && userIsSessionMember(mutable.session, partnerId)) {
      await notifyPartner(sessionId, partnerId, 'session.resolved', {
        closedBy: user.id,
        kind: closureKind,
        agreementIds,
      });
    }

    await publishSessionEvent(sessionId, 'session.resolved', {
      closureKind,
      agreementIds,
    });

    const state = await buildStage4State(sessionId, user.id);
    if (!state.outcome) {
      errorResponse(res, 'INTERNAL_ERROR', 'Stage 4 closed but outcome was not available', 500);
      return;
    }

    successResponse(res, {
      closed: true,
      closedAt: now.toISOString(),
      outcome: state.outcome,
      state,
    });
  } catch (error) {
    logger.error('[closeStage4] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to close Stage 4', 500);
  }
}

/**
 * Get anonymous strategy pool for the session
 * GET /sessions/:id/strategies
 */
export async function getStrategies(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Return empty data for non-active sessions (allows parallel fetching)
    if (session.status !== 'ACTIVE') {
      successResponse(res, {
        strategies: [],
        phase: StrategyPhase.COLLECTING,
        aiSuggestionsAvailable: false,
      });
      return;
    }

    // Get creator attribution for server-side visibility checks, but strip it
    // before returning the anonymous pool to clients.
    const strategies = await prisma.strategyProposal.findMany({
      where: { sessionId },
      select: {
        id: true,
        description: true,
        needsAddressed: true,
        duration: true,
        measureOfSuccess: true,
        createdByUserId: true,
      },
    }) as StrategyProposalForVisibility[];

    // Compute actual phase from DB state
    const allProgress = await prisma.stageProgress.findMany({
      where: { sessionId, stage: 4 },
    });

    const rankings = await prisma.strategyRanking.findMany({
      where: { sessionId },
    });

    // Check gates for both users
    const allReadyToRank = allProgress.length >= 2 &&
      allProgress.every((p) => {
        const gates = p.gatesSatisfied as Record<string, unknown> | null;
        return gates?.readyToRank === true;
      });
    const myProgress = allProgress.find((p) => p.userId === user.id);
    const partnerProgress = allProgress.find((p) => p.userId !== user.id);
    const myGates = myProgress?.gatesSatisfied as Record<string, unknown> | null;
    const partnerGates = partnerProgress?.gatesSatisfied as Record<string, unknown> | null;

    const bothRanked = rankings.length >= 2;
    const myRanked = rankings.some((r) => r.userId === user.id);
    const myProposalCount = strategies.filter((s) => s.createdByUserId === user.id).length;
    const rankingOpenForUser = allReadyToRank && myProposalCount > 0;

    let phase: StrategyPhase;
    if (bothRanked) {
      phase = StrategyPhase.REVEALING;
    } else if (myRanked) {
      phase = StrategyPhase.REVEALING;
    } else if (rankingOpenForUser) {
      phase = StrategyPhase.RANKING;
    } else {
      phase = StrategyPhase.COLLECTING;
    }

    const fullPoolVisible = rankingOpenForUser || myRanked || bothRanked;
    const visibleStrategies = fullPoolVisible
      ? strategies
      : strategies.filter((s) => s.createdByUserId === user.id);
    const canRank = phase === StrategyPhase.RANKING && !myRanked && strategies.length > 0;
    const canMarkReadyToRank = phase === StrategyPhase.COLLECTING &&
      myGates?.readyToRank !== true &&
      myProposalCount > 0;

    // Shuffle to avoid order bias
    const shuffled = shuffleArray(visibleStrategies.map(toStrategyDTO));

    successResponse(res, {
      strategies: shuffled,
      phase,
      aiSuggestionsAvailable: false,
      myReadyToRank: myGates?.readyToRank === true,
      partnerReadyToRank: partnerGates?.readyToRank === true,
      canMarkReadyToRank,
      canRank,
      rankableStrategyCount: fullPoolVisible ? strategies.length : visibleStrategies.length,
    });
  } catch (error) {
    logger.error('[getStrategies] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get strategies', 500);
  }
}

/**
 * Propose a new strategy
 * POST /sessions/:id/strategies
 */
export async function proposeStrategy(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = proposeStrategyRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { description, needsAddressed, duration, measureOfSuccess } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot propose strategy: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Create strategy proposal
    const strategy = await prisma.strategyProposal.create({
      data: {
        sessionId,
        createdByUserId: user.id,
        description,
        needsAddressed,
        duration,
        measureOfSuccess,
        source: 'USER_SUBMITTED',
      },
    });

    successResponse(
      res,
      {
        strategy: {
          id: strategy.id,
          description: strategy.description,
          duration: strategy.duration,
          measureOfSuccess: strategy.measureOfSuccess,
        },
        createdAt: strategy.createdAt.toISOString(),
      },
      201
    );
  } catch (error) {
    logger.error('[proposeStrategy] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to propose strategy', 500);
  }
}

/**
 * Submit strategy ranking
 * POST /sessions/:id/strategies/rank
 */
export async function submitRanking(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = rankStrategiesRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { rankedIds } = parseResult.data;
    if (new Set(rankedIds).size !== rankedIds.length) {
      errorResponse(res, 'VALIDATION_ERROR', 'Ranked strategy IDs must be unique', 400);
      return;
    }

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot submit ranking: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    const allProgress = await prisma.stageProgress.findMany({
      where: { sessionId, stage: 4 },
    });
    const allReadyToRank = allProgress.length >= 2 &&
      allProgress.every((p) => {
        const gates = p.gatesSatisfied as Record<string, unknown> | null;
        return gates?.readyToRank === true;
      });
    if (!allReadyToRank) {
      errorResponse(res, 'VALIDATION_ERROR', 'Strategies are not ready to rank yet', 400);
      return;
    }

    const myProposalCount = await prisma.strategyProposal.count({
      where: { sessionId, createdByUserId: user.id },
    });
    if (myProposalCount === 0) {
      errorResponse(res, 'VALIDATION_ERROR', 'Add at least one strategy before ranking', 400);
      return;
    }

    const rankableStrategies = await prisma.strategyProposal.findMany({
      where: { sessionId },
      select: { id: true },
    });
    const rankableIds = new Set(rankableStrategies.map((strategy) => strategy.id));
    if (rankedIds.some((id) => !rankableIds.has(id))) {
      errorResponse(res, 'VALIDATION_ERROR', 'Ranked strategy IDs must belong to this session', 400);
      return;
    }

    // Upsert ranking
    await prisma.strategyRanking.upsert({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      create: { sessionId, userId: user.id, rankedIds },
      update: { rankedIds, submittedAt: new Date() },
    });

    // Update gate
    const gatesSatisfied = {
      ...(progress?.gatesSatisfied as Record<string, unknown> | null || {}),
      rankingSubmitted: true,
      rankingSubmittedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonValue;

    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: { sessionId, userId: user.id, stage: 4 },
      },
      data: { gatesSatisfied },
    });

    // Check if partner has also ranked
    const partnerId = await getPartnerUserId(sessionId, user.id);
    const rankings = await prisma.strategyRanking.findMany({
      where: { sessionId },
    });

    const partnerRanked = rankings.some((r) => r.userId === partnerId);
    const canReveal = rankings.length >= 2;

    // Notify partner
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.ranking_submitted', {
        stage: 4,
        submittedBy: user.id,
      });
    }

    successResponse(res, {
      submitted: true,
      submittedAt: new Date().toISOString(),
      partnerSubmitted: partnerRanked,
      awaitingReveal: canReveal,
      // Legacy aliases kept for older clients.
      ranked: true,
      rankedAt: new Date().toISOString(),
      partnerRanked,
      canReveal,
    });
  } catch (error) {
    logger.error('[submitRanking] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to submit ranking', 500);
  }
}

/**
 * Get ranking overlap between partners
 * GET /sessions/:id/strategies/overlap
 */
export async function getOverlap(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Return empty data for non-active sessions (allows parallel fetching)
    if (session.status !== 'ACTIVE') {
      successResponse(res, {
        overlap: null,
        waitingForPartner: false,
        agreementCandidates: null,
      });
      return;
    }

    const partnerId = await getPartnerUserId(sessionId, user.id);

    // Get all rankings for this session
    const rankings = await prisma.strategyRanking.findMany({
      where: { sessionId },
    });

    // Check if both have ranked
    if (rankings.length < 2) {
      successResponse(res, {
        overlap: null,
        waitingForPartner: true,
        agreementCandidates: null,
      });
      return;
    }

    // Calculate overlap
    const myRanking = rankings.find((r) => r.userId === user.id);
    const partnerRanking = rankings.find((r) => r.userId === partnerId);

    if (!myRanking || !partnerRanking) {
      successResponse(res, {
        overlap: null,
        waitingForPartner: true,
        agreementCandidates: null,
      });
      return;
    }

    // Simple overlap: strategies in both top 3
    const myTop3 = new Set(myRanking.rankedIds.slice(0, 3));
    const partnerTop3 = new Set(partnerRanking.rankedIds.slice(0, 3));
    const topOverlapIds = [...myTop3].filter((id) => partnerTop3.has(id));

    // Get strategy details for overlapping strategies
    const overlapStrategies = topOverlapIds.length > 0
      ? await prisma.strategyProposal.findMany({
          where: { id: { in: topOverlapIds } },
          select: {
            id: true,
            description: true,
            needsAddressed: true,
            duration: true,
          },
        })
      : [];

    // Agreement candidates: overlapping or top choices from each
    const agreementCandidateIds = topOverlapIds.length > 0
      ? topOverlapIds
      : [myRanking.rankedIds[0], partnerRanking.rankedIds[0]].filter(Boolean);

    const agreementCandidates = await prisma.strategyProposal.findMany({
      where: { id: { in: agreementCandidateIds } },
      select: {
        id: true,
        description: true,
        duration: true,
      },
    });

    successResponse(res, {
      overlap: overlapStrategies,
      waitingForPartner: false,
      agreementCandidates,
    });
  } catch (error) {
    logger.error('[getOverlap] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get overlap', 500);
  }
}

/**
 * Create agreement from a strategy
 * POST /sessions/:id/agreements
 */
export async function createAgreement(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Validate request body
    const parseResult = createAgreementRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { strategyId, description, type, followUpDate } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot create agreement: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Enforce maximum agreements per session
    const agreementCount = await prisma.agreement.count({
      where: { sharedVessel: { sessionId } },
    });
    if (agreementCount >= MAX_AGREEMENTS) {
      errorResponse(res, 'VALIDATION_ERROR', 'Maximum of 2 agreements per session', 400);
      return;
    }

    // Enforce uniqueness: one agreement per strategy
    if (strategyId) {
      const existingAgreement = await prisma.agreement.findFirst({
        where: { sharedVessel: { sessionId }, proposalId: strategyId },
      });
      if (existingAgreement) {
        errorResponse(res, 'CONFLICT', 'An agreement already exists for this strategy', 409);
        return;
      }
    }

    // Get or verify the strategy if provided
    if (strategyId) {
      const strategy = await prisma.strategyProposal.findUnique({
        where: { id: strategyId },
      });
      if (!strategy || strategy.sessionId !== sessionId) {
        errorResponse(res, 'NOT_FOUND', 'Strategy not found', 404);
        return;
      }
    }

    // Get shared vessel
    const sharedVessel = await prisma.sharedVessel.findUnique({
      where: { sessionId },
    });

    if (!sharedVessel) {
      errorResponse(res, 'NOT_FOUND', 'Shared vessel not found', 404);
      return;
    }

    // Determine user slot
    const userSlot = await getUserSlot(sessionId, user.id);

    // Create agreement - proposer auto-agrees
    const agreement = await prisma.agreement.create({
      data: {
        sharedVesselId: sharedVessel.id,
        description,
        type,
        proposalId: strategyId || null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        status: 'PROPOSED',
        agreedByA: userSlot === 'A',
        agreedByB: userSlot === 'B',
      },
    });

    // Notify partner via real-time and create in-app notification
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'agreement.proposed', {
        agreementId: agreement.id,
        proposedBy: user.id,
      });
    }

    successResponse(
      res,
      {
        agreement: {
          id: agreement.id,
          strategyId: agreement.proposalId,
          description: agreement.description,
          type: agreement.type,
          duration: null,
          measureOfSuccess: null,
          status: agreement.status,
          agreedByMe: true,
          agreedByPartner: false,
          agreedAt: agreement.agreedAt?.toISOString() ?? null,
          followUpDate: agreement.followUpDate?.toISOString() ?? null,
        },
        awaitingPartnerConfirmation: true,
      },
      201
    );
  } catch (error) {
    logger.error('[createAgreement] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to create agreement', 500);
  }
}

/**
 * Confirm or decline an agreement
 * POST /sessions/:id/agreements/:agreementId/confirm
 */
export async function confirmAgreement(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId, agreementId } = req.params;

    // Validate request body
    const parseResult = confirmAgreementRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        parseResult.error.issues
      );
      return;
    }

    const { confirmed } = parseResult.data;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot confirm agreement: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // Get the agreement
    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      include: {
        sharedVessel: true,
      },
    });

    if (!agreement) {
      errorResponse(res, 'NOT_FOUND', 'Agreement not found', 404);
      return;
    }

    // Verify agreement belongs to this session
    if (agreement.sharedVessel.sessionId !== sessionId) {
      errorResponse(res, 'NOT_FOUND', 'Agreement not found', 404);
      return;
    }

    // Determine user slot
    const userSlot = await getUserSlot(sessionId, user.id);

    // Update agreement based on confirmation
    const updateData: Prisma.AgreementUpdateInput = {};

    if (confirmed) {
      if (userSlot === 'A') {
        updateData.agreedByA = true;
      } else if (userSlot === 'B') {
        updateData.agreedByB = true;
      }

      // Check if both have now agreed
      const willBothAgree =
        (userSlot === 'A' && agreement.agreedByB) ||
        (userSlot === 'B' && agreement.agreedByA);

      if (willBothAgree) {
        updateData.status = 'AGREED';
        updateData.agreedAt = new Date();
      }
    }
    // If not confirmed, we don't change agreement status - it stays PROPOSED for renegotiation

    const updatedAgreement = await prisma.agreement.update({
      where: { id: agreementId },
      data: updateData,
    });

    const bothConfirmed = updatedAgreement.agreedByA && updatedAgreement.agreedByB;

    // Notify partner via real-time and create in-app notification
    const partnerId = await getPartnerUserId(sessionId, user.id);
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'agreement.confirmed', {
        agreementId: agreement.id,
        confirmedBy: user.id,
        confirmed,
        bothConfirmed,
      });
    }

    // Check if ALL agreements in this session are fully confirmed
    const allAgreements = await prisma.agreement.findMany({
      where: { sharedVessel: { sessionId } },
    });
    const sessionCanResolve = allAgreements.length > 0 &&
      allAgreements.every(a => a.agreedByA && a.agreedByB);

    if (sessionCanResolve) {
      // Auto-resolve session when all agreements confirmed
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      // Mark all stage progress as COMPLETED
      await prisma.stageProgress.updateMany({
        where: { sessionId, completedAt: null },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await publishSessionEvent(sessionId, 'session.resolved', {
        agreementId: updatedAgreement.id,
      });
    }

    successResponse(res, {
      agreement: {
        id: updatedAgreement.id,
        strategyId: updatedAgreement.proposalId,
        description: updatedAgreement.description,
        type: updatedAgreement.type,
        duration: null, // Field not in Prisma model
        measureOfSuccess: null, // Field not in Prisma model
        status: updatedAgreement.status,
        agreedByMe: userSlot === 'A' ? updatedAgreement.agreedByA : updatedAgreement.agreedByB,
        agreedByPartner: userSlot === 'A' ? updatedAgreement.agreedByB : updatedAgreement.agreedByA,
        agreedAt: updatedAgreement.agreedAt?.toISOString() ?? null,
        followUpDate: updatedAgreement.followUpDate?.toISOString() ?? null,
      },
      sessionCanResolve,
    });
  } catch (error) {
    logger.error('[confirmAgreement] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to confirm agreement', 500);
  }
}

/**
 * Request AI strategy suggestions
 * POST /sessions/:id/strategies/suggestions
 */
export async function requestSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;
    const { count = 3, focusNeeds } = req.body as {
      count?: number;
      focusNeeds?: string[];
    };

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot request suggestions: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    // TODO: Call AI service to generate strategy suggestions based on common ground
    // For now, return empty array - implement AI suggestion service separately
    const suggestions: never[] = [];

    successResponse(res, {
      suggestions,
      source: 'AI_GENERATED',
      count: suggestions.length,
    });
  } catch (error) {
    logger.error('[requestSuggestions] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to request suggestions', 500);
  }
}

/**
 * Mark ready to rank strategies
 * POST /sessions/:id/strategies/ready
 */
export async function markReady(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        relationship: {
          members: {
            some: { userId: user.id },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Check session is active
    if (session.status !== 'ACTIVE') {
      errorResponse(res, 'SESSION_NOT_ACTIVE', 'Session is not active', 400);
      return;
    }

    // Get user's current stage progress
    const progress = await prisma.stageProgress.findFirst({
      where: {
        sessionId,
        userId: user.id,
        status: 'IN_PROGRESS',
      },
      orderBy: { stage: 'desc' },
    });

    // Check user is in stage 4
    const currentStage = progress?.stage ?? 0;
    if (currentStage !== 4) {
      errorResponse(
        res,
        'VALIDATION_ERROR',
        `Cannot mark ready: you are in stage ${currentStage}, but stage 4 is required`,
        400
      );
      return;
    }

    const myProposalCount = await prisma.strategyProposal.count({
      where: { sessionId, createdByUserId: user.id },
    });
    if (myProposalCount === 0) {
      errorResponse(res, 'VALIDATION_ERROR', 'Add at least one strategy before marking ready to rank', 400);
      return;
    }

    // Update gate
    const readyAt = new Date().toISOString();
    const gatesSatisfied = {
      ...(progress?.gatesSatisfied as Record<string, unknown> | null || {}),
      readyToRank: true,
      readyAt,
    } satisfies Prisma.InputJsonValue;

    await prisma.stageProgress.update({
      where: {
        sessionId_userId_stage: { sessionId, userId: user.id, stage: 4 },
      },
      data: { gatesSatisfied },
    });

    // Check if partner is also ready
    const partnerId = await getPartnerUserId(sessionId, user.id);
    const partnerProgress = partnerId ? await prisma.stageProgress.findUnique({
      where: {
        sessionId_userId_stage: { sessionId, userId: partnerId, stage: 4 },
      },
    }) : null;

    const partnerGates = partnerProgress?.gatesSatisfied as Record<string, unknown> | null;
    const partnerReady = partnerGates?.readyToRank === true;
    const canStartRanking = partnerReady;

    // Notify partner
    if (partnerId) {
      await notifyPartner(sessionId, partnerId, 'partner.ready_to_rank', {
        stage: 4,
        readyBy: user.id,
      });
    }

    successResponse(res, {
      ready: true,
      readyAt,
      partnerReady,
      canStartRanking,
    });
  } catch (error) {
    logger.error('[markReady] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to mark ready', 500);
  }
}

/**
 * Get agreements list
 * GET /sessions/:id/agreements
 */
export async function getAgreements(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      errorResponse(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }

    const { id: sessionId } = req.params;

    // Check session exists and user has access
    const session = await prisma.session.findFirst({
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
              orderBy: { joinedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!session) {
      errorResponse(res, 'NOT_FOUND', 'Session not found', 404);
      return;
    }

    // Get shared vessel
    const sharedVessel = await prisma.sharedVessel.findUnique({
      where: { sessionId },
    });

    if (!sharedVessel) {
      successResponse(res, {
        agreements: [],
      });
      return;
    }

    // Get agreements for this shared vessel
    const agreements = await prisma.agreement.findMany({
      where: { sharedVesselId: sharedVessel.id },
    });

    // Determine if user is A or B
    const members = session.relationship.members;
    const userIsA = members[0]?.userId === user.id;

    successResponse(res, {
      agreements: agreements.map((a) => ({
        id: a.id,
        strategyId: a.proposalId,
        description: a.description,
        type: a.type,
        duration: null, // Field removed from schema
        measureOfSuccess: null, // Field removed from schema
        status: a.status,
        agreedByMe: userIsA ? a.agreedByA : a.agreedByB,
        agreedByPartner: userIsA ? a.agreedByB : a.agreedByA,
        agreedAt: a.agreedAt?.toISOString() ?? null,
        followUpDate: a.followUpDate?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error('[getAgreements] Error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get agreements', 500);
  }
}
