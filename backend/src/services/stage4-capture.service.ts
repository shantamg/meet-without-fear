import { Prisma } from '@prisma/client';
import {
  ProposalInventoryDTO,
  Stage4CoverageAuditDTO,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export type Stage4CaptureInput = {
  sessionId: string;
  userId: string;
  messageId: string;
  userMessage: string;
  aiResponse: string;
  currentInventory?: ProposalInventoryDTO;
  confirmedNeeds?: Stage4NeedDTO[];
  recentStage4Messages?: Array<{ role: 'USER' | 'AI'; userId?: string; content: string; timestamp: string }>;
  compatibilityProposedStrategies?: string[];
};

export type Stage4NeedDTO = {
  id?: string;
  label: string;
  sourceUserId?: string;
};

export type Stage4InventoryOperation =
  | {
      type: 'ADD_PROPOSAL';
      tempKey: string;
      kind: Stage4ProposalKind;
      ownerUserId?: string;
      description: string;
      needsAddressed: string[];
      duration?: string;
      measureOfSuccess?: string;
      capturedQuote?: string;
    }
  | {
      type: 'REVISE_PROPOSAL';
      proposalId: string;
      description?: string;
      needsAddressed?: string[];
      duration?: string;
      measureOfSuccess?: string;
      reason?: string;
    }
  | {
      type: 'REMOVE_PROPOSAL';
      proposalId: string;
      reason?: string;
    }
  | {
      type: 'RESTORE_PROPOSAL';
      proposalId: string;
      reason?: string;
    };

export type Stage4SelectionCaptureDTO = {
  userId: string;
  decisions: Array<{
    proposalId: string;
    decision: Stage4SelectionDecision;
    note?: string;
  }>;
};

export type Stage4ClosureSignalDTO = {
  readyToClose: boolean;
  kind?: Stage4ClosureKind;
  reason?: Stage4ClosureReason;
  summary?: string;
};

export type Stage4TendingTimingDTO = {
  proposalId?: string;
  agreementId?: string;
  suggestedFollowUpDate?: string;
  sourceText?: string;
};

export type Stage4CaptureResult = {
  operations: Stage4InventoryOperation[];
  coverageAudit?: Stage4CoverageAuditDTO;
  selection?: Stage4SelectionCaptureDTO;
  closureSignal?: Stage4ClosureSignalDTO;
  tendingTiming?: Stage4TendingTimingDTO;
  confidence: number;
  rationale: string;
  appliedOperationCount: number;
  skippedOperationCount: number;
};

type ProposalRow = {
  id: string;
  sessionId: string;
  createdByUserId: string | null;
  description: string;
  needsAddressed: string[];
  duration: string | null;
  measureOfSuccess: string | null;
  kind: Stage4ProposalKind;
  status: Stage4ProposalStatus;
  removedAt: Date | null;
  removedByUserId: string | null;
  removalReason: string | null;
};

const CAPTURE_CONFIDENCE_THRESHOLD = 0.7;
const DESTRUCTIVE_CONFIDENCE_THRESHOLD = 0.85;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanProposalDescription(value: string): string {
  return value
    .replace(/^to\s+/i, '')
    .replace(/\s+(?:please|maybe|i think|if that works)$/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function hasEnoughSpecificity(description: string): boolean {
  const normalized = normalizeText(description);
  if (normalized.length < 12) return false;
  return !['communicate better', 'be nicer', 'try harder', 'do better'].includes(normalized);
}

function getOverlapScore(haystack: string, needle: string): number {
  const haystackWords = new Set(normalizeText(haystack).split(' ').filter(Boolean));
  const needleWords = normalizeText(needle).split(' ').filter((word) => word.length > 2);
  if (needleWords.length === 0) return 0;
  const overlap = needleWords.filter((word) => haystackWords.has(word)).length;
  return overlap / needleWords.length;
}

function findReferencedProposal(
  text: string,
  proposals: ProposalRow[],
  allowedStatus: Stage4ProposalStatus[]
): { proposal: ProposalRow | null; confidence: number } {
  const candidates = proposals.filter((proposal) => allowedStatus.includes(proposal.status));
  if (candidates.length === 0) return { proposal: null, confidence: 0 };

  const quoted = text.match(/["'“”](.+?)["'“”]/)?.[1];
  const referenceText = quoted ?? text;
  const direct = candidates.find((proposal) =>
    normalizeText(referenceText).includes(normalizeText(proposal.description))
  );
  if (direct) return { proposal: direct, confidence: quoted ? 0.95 : 0.9 };

  const scored = candidates
    .map((proposal) => ({ proposal, score: getOverlapScore(referenceText, proposal.description) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 0.6) return { proposal: scored[0].proposal, confidence: 0.82 };

  if (candidates.length === 1 && /\b(that|it|this|the proposal|the idea)\b/i.test(text)) {
    return { proposal: candidates[0], confidence: 0.88 };
  }

  return { proposal: null, confidence: 0 };
}

function inferProposalKind(text: string): Stage4ProposalKind {
  if (/\b(i can|i could|i will|i'll|i would|i want to|i am going to|i'm going to)\b/i.test(text)) {
    return Stage4ProposalKind.INDIVIDUAL_COMMITMENT;
  }
  return Stage4ProposalKind.SHARED_PROPOSAL;
}

function extractAddOperations(input: Stage4CaptureInput): Stage4InventoryOperation[] {
  const operations: Stage4InventoryOperation[] = [];
  const compatibility = input.compatibilityProposedStrategies ?? [];

  compatibility.forEach((description, index) => {
    const cleaned = cleanProposalDescription(description);
    if (!hasEnoughSpecificity(cleaned)) return;
    const kind = inferProposalKind(cleaned);
    operations.push({
      type: 'ADD_PROPOSAL',
      tempKey: `compat-${index}`,
      kind,
      ownerUserId: kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT ? input.userId : undefined,
      description: cleaned,
      needsAddressed: [],
      capturedQuote: description,
    });
  });

  const addPatterns = [
    /\b(?:what if we|we could|we can|we should|we might|let's|let us)\s+(.+?)(?:$|[.!?]\s)/gi,
    /\b(?:i can|i could|i will|i'll|i would|i want to|i am going to|i'm going to)\s+(.+?)(?:$|[.!?]\s)/gi,
  ];

  addPatterns.forEach((pattern) => {
    for (const match of input.userMessage.matchAll(pattern)) {
      const raw = match[0];
      if (/\b(?:not willing|willing|remove|delete|take .* off|drop that|change|revise|update)\b/i.test(raw)) {
        continue;
      }
      const description = cleanProposalDescription(match[1] ?? '');
      if (!hasEnoughSpecificity(description)) continue;
      const kind = inferProposalKind(raw);
      operations.push({
        type: 'ADD_PROPOSAL',
        tempKey: `heuristic-${operations.length}`,
        kind,
        ownerUserId: kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT ? input.userId : undefined,
        description,
        needsAddressed: [],
        capturedQuote: raw.trim(),
      });
    }
  });

  return operations;
}

function extractDestructiveOrRevisionOperation(
  text: string,
  proposals: ProposalRow[]
): { operation: Stage4InventoryOperation | null; confidence: number; lowConfidenceAction?: string } {
  if (/\b(?:remove|delete|drop|take)\b.*\b(?:proposal|idea|strategy|that|it|off|out)\b/i.test(text)) {
    const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.ACTIVE, Stage4ProposalStatus.REVISED]);
    if (match.proposal) {
      return {
        operation: {
          type: 'REMOVE_PROPOSAL',
          proposalId: match.proposal.id,
          reason: text,
        },
        confidence: match.confidence,
      };
    }
    return { operation: null, confidence: 0.4, lowConfidenceAction: 'REMOVE_PROPOSAL' };
  }

  if (/\b(?:restore|bring back|put back)\b/i.test(text)) {
    const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.REMOVED]);
    if (match.proposal) {
      return {
        operation: {
          type: 'RESTORE_PROPOSAL',
          proposalId: match.proposal.id,
          reason: text,
        },
        confidence: match.confidence,
      };
    }
    return { operation: null, confidence: 0.4, lowConfidenceAction: 'RESTORE_PROPOSAL' };
  }

  const reviseMatch = text.match(/\b(?:change|revise|update)\b.+?\bto\b\s+(.+?)(?:$|[.!?]\s)/i);
  if (reviseMatch) {
    const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.ACTIVE, Stage4ProposalStatus.REVISED]);
    const description = cleanProposalDescription(reviseMatch[1] ?? '');
    if (match.proposal && hasEnoughSpecificity(description)) {
      return {
        operation: {
          type: 'REVISE_PROPOSAL',
          proposalId: match.proposal.id,
          description,
          reason: text,
        },
        confidence: match.confidence,
      };
    }
    return { operation: null, confidence: 0.45, lowConfidenceAction: 'REVISE_PROPOSAL' };
  }

  return { operation: null, confidence: 0 };
}

function extractSelection(text: string, userId: string, proposals: ProposalRow[]): Stage4SelectionCaptureDTO | undefined {
  let decision: Stage4SelectionDecision | null = null;
  if (/\b(?:not willing|won't|do not want|don't want|no to)\b/i.test(text)) {
    decision = Stage4SelectionDecision.NOT_WILLING;
  } else if (/\b(?:needs discussion|need to discuss|talk more|not sure yet)\b/i.test(text)) {
    decision = Stage4SelectionDecision.NEEDS_DISCUSSION;
  } else if (/\b(?:willing|yes to|i can try|i'd try|i would try|works for me)\b/i.test(text)) {
    decision = Stage4SelectionDecision.WILLING;
  }
  if (!decision) return undefined;

  const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.ACTIVE, Stage4ProposalStatus.REVISED]);
  if (!match.proposal || match.confidence < CAPTURE_CONFIDENCE_THRESHOLD) return undefined;

  return {
    userId,
    decisions: [
      {
        proposalId: match.proposal.id,
        decision,
        note: text,
      },
    ],
  };
}

function proposalSnapshot(proposal: ProposalRow): Prisma.JsonObject {
  return {
    description: proposal.description,
    needsAddressed: proposal.needsAddressed,
    duration: proposal.duration,
    measureOfSuccess: proposal.measureOfSuccess,
    kind: proposal.kind,
    status: proposal.status,
    removedAt: proposal.removedAt?.toISOString() ?? null,
    removedByUserId: proposal.removedByUserId,
    removalReason: proposal.removalReason,
  };
}

async function auditSkippedDestructiveCapture(
  proposals: ProposalRow[],
  input: Stage4CaptureInput,
  action: string,
  confidence: number
): Promise<void> {
  const match = findReferencedProposal(input.userMessage, proposals, [
    Stage4ProposalStatus.ACTIVE,
    Stage4ProposalStatus.REVISED,
    Stage4ProposalStatus.REMOVED,
  ]);
  if (!match.proposal) {
    logger.info('[stage4-capture] Skipped low-confidence destructive capture without proposal match', {
      sessionId: input.sessionId,
      userId: input.userId,
      action,
      confidence,
    });
    return;
  }

  await prisma.stage4ProposalRevision.create({
    data: {
      proposalId: match.proposal.id,
      sessionId: input.sessionId,
      actorUserId: input.userId,
      action: 'CAPTURE_SKIPPED',
      before: proposalSnapshot(match.proposal),
      after: { requestedAction: action, confidence },
      reason: 'Low-confidence destructive Stage 4 capture was not applied.',
      messageId: input.messageId,
    },
  });
}

async function applyOperation(
  operation: Stage4InventoryOperation,
  input: Stage4CaptureInput,
  proposals: ProposalRow[]
): Promise<boolean> {
  if (operation.type === 'ADD_PROPOSAL') {
    const duplicate = proposals.find(
      (proposal) =>
        proposal.status !== Stage4ProposalStatus.REMOVED &&
        normalizeText(proposal.description) === normalizeText(operation.description)
    );
    if (duplicate) return false;

    const created = await prisma.strategyProposal.create({
      data: {
        sessionId: input.sessionId,
        createdByUserId: operation.ownerUserId ?? input.userId,
        description: operation.description,
        needsAddressed: operation.needsAddressed,
        duration: operation.duration,
        measureOfSuccess: operation.measureOfSuccess,
        source: 'AI_SUGGESTED',
        kind: operation.kind,
        status: Stage4ProposalStatus.ACTIVE,
        capturedFromMessageId: input.messageId,
      },
    });
    await prisma.stage4ProposalRevision.create({
      data: {
        proposalId: created.id,
        sessionId: input.sessionId,
        actorUserId: input.userId,
        action: 'CREATED',
        before: Prisma.JsonNull,
        after: {
          description: operation.description,
          needsAddressed: operation.needsAddressed,
          duration: operation.duration ?? null,
          measureOfSuccess: operation.measureOfSuccess ?? null,
          kind: operation.kind,
          status: Stage4ProposalStatus.ACTIVE,
          capturedQuote: operation.capturedQuote ?? null,
        },
        reason: 'Captured from Stage 4 conversation.',
        messageId: input.messageId,
      },
    });
    return true;
  }

  const proposal = proposals.find((candidate) => candidate.id === operation.proposalId);
  if (!proposal) return false;

  if (operation.type === 'REMOVE_PROPOSAL') {
    await prisma.strategyProposal.update({
      where: { id: operation.proposalId },
      data: {
        status: Stage4ProposalStatus.REMOVED,
        removedAt: new Date(),
        removedByUserId: input.userId,
        removalReason: operation.reason,
      },
    });
    await prisma.stage4ProposalRevision.create({
      data: {
        proposalId: operation.proposalId,
        sessionId: input.sessionId,
        actorUserId: input.userId,
        action: 'REMOVED',
        before: proposalSnapshot(proposal),
        after: {
          ...proposalSnapshot(proposal),
          status: Stage4ProposalStatus.REMOVED,
          removedByUserId: input.userId,
          removalReason: operation.reason ?? null,
        },
        reason: operation.reason,
        messageId: input.messageId,
      },
    });
    return true;
  }

  if (operation.type === 'RESTORE_PROPOSAL') {
    await prisma.strategyProposal.update({
      where: { id: operation.proposalId },
      data: {
        status: Stage4ProposalStatus.ACTIVE,
        removedAt: null,
        removedByUserId: null,
        removalReason: null,
      },
    });
    await prisma.stage4ProposalRevision.create({
      data: {
        proposalId: operation.proposalId,
        sessionId: input.sessionId,
        actorUserId: input.userId,
        action: 'RESTORED',
        before: proposalSnapshot(proposal),
        after: {
          ...proposalSnapshot(proposal),
          status: Stage4ProposalStatus.ACTIVE,
          removedAt: null,
          removedByUserId: null,
          removalReason: null,
        },
        reason: operation.reason,
        messageId: input.messageId,
      },
    });
    return true;
  }

  await prisma.strategyProposal.update({
    where: { id: operation.proposalId },
    data: {
      description: operation.description ?? proposal.description,
      needsAddressed: operation.needsAddressed ?? proposal.needsAddressed,
      duration: operation.duration ?? proposal.duration,
      measureOfSuccess: operation.measureOfSuccess ?? proposal.measureOfSuccess,
      status: Stage4ProposalStatus.REVISED,
    },
  });
  await prisma.stage4ProposalRevision.create({
    data: {
      proposalId: operation.proposalId,
      sessionId: input.sessionId,
      actorUserId: input.userId,
      action: 'REVISED',
      before: proposalSnapshot(proposal),
      after: {
        ...proposalSnapshot(proposal),
        description: operation.description ?? proposal.description,
        needsAddressed: operation.needsAddressed ?? proposal.needsAddressed,
        duration: operation.duration ?? proposal.duration,
        measureOfSuccess: operation.measureOfSuccess ?? proposal.measureOfSuccess,
        status: Stage4ProposalStatus.REVISED,
      },
      reason: operation.reason,
      messageId: input.messageId,
    },
  });
  return true;
}

export async function captureStage4Turn(input: Stage4CaptureInput): Promise<Stage4CaptureResult> {
  const proposals = (await prisma.strategyProposal.findMany({
    where: { sessionId: input.sessionId },
    orderBy: { updatedAt: 'desc' },
  })) as ProposalRow[];

  const operations = extractAddOperations(input);
  const destructiveOrRevision = extractDestructiveOrRevisionOperation(input.userMessage, proposals);
  if (destructiveOrRevision.operation) {
    operations.push(destructiveOrRevision.operation);
  }

  const selection = extractSelection(input.userMessage, input.userId, proposals);
  const confidence = operations.length > 0 || selection
    ? Math.max(
        operations.some((operation) => operation.type === 'ADD_PROPOSAL') ? 0.78 : 0,
        destructiveOrRevision.confidence,
        selection ? 0.82 : 0
      )
    : 0;

  let appliedOperationCount = 0;
  let skippedOperationCount = 0;

  if (destructiveOrRevision.lowConfidenceAction && destructiveOrRevision.confidence < DESTRUCTIVE_CONFIDENCE_THRESHOLD) {
    skippedOperationCount += 1;
    await auditSkippedDestructiveCapture(
      proposals,
      input,
      destructiveOrRevision.lowConfidenceAction,
      destructiveOrRevision.confidence
    );
  }

  for (const operation of operations) {
    const isDestructive = operation.type === 'REMOVE_PROPOSAL' || operation.type === 'RESTORE_PROPOSAL';
    const requiredConfidence = isDestructive ? DESTRUCTIVE_CONFIDENCE_THRESHOLD : CAPTURE_CONFIDENCE_THRESHOLD;
    const operationConfidence = isDestructive ? destructiveOrRevision.confidence : confidence;
    if (operationConfidence < requiredConfidence) {
      skippedOperationCount += 1;
      continue;
    }
    const applied = await applyOperation(operation, input, proposals);
    if (applied) appliedOperationCount += 1;
    else skippedOperationCount += 1;
  }

  if (selection) {
    for (const decision of selection.decisions) {
      await prisma.stage4ProposalSelection.upsert({
        where: {
          proposalId_userId: {
            proposalId: decision.proposalId,
            userId: input.userId,
          },
        },
        create: {
          proposalId: decision.proposalId,
          sessionId: input.sessionId,
          userId: input.userId,
          decision: decision.decision,
          note: decision.note,
        },
        update: {
          decision: decision.decision,
          note: decision.note,
          selectedAt: new Date(),
        },
      });
    }
  }

  return {
    operations,
    selection,
    closureSignal: /\b(?:stop|done|close this|no agreement|no shared agreement)\b/i.test(input.userMessage)
      ? {
          readyToClose: true,
          kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
          reason: Stage4ClosureReason.USER_STOPPED,
          summary: input.userMessage,
        }
      : undefined,
    confidence,
    rationale: operations.length > 0 || selection
      ? 'Captured deterministic Stage 4 inventory or selection signal from the conversation turn.'
      : 'No high-confidence Stage 4 inventory operation detected.',
    appliedOperationCount,
    skippedOperationCount,
  };
}
