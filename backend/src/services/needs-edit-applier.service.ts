import {
  AffectedNeed,
  ApplyNeedEditsResponse,
  IdentifiedNeedDTO,
  NeedCategory,
  NeedEditOperation,
} from '@meet-without-fear/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanVisibleAIText } from '../utils/visible-text';
import { validateNeedIsUniversal, withNeedReframingWarning } from './needs';

type NeedRow = {
  id: string;
  vesselId: string;
  need: string;
  category: NeedCategory;
  evidence: string[];
  aiConfidence: number;
  confirmed: boolean;
  createdAt: Date;
};

export class NeedEditValidationError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'NeedEditValidationError';
  }
}

export class NeedEditForbiddenError extends Error {
  statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = 'NeedEditForbiddenError';
  }
}

async function getOrCreateUserVessel(
  sessionId: string,
  userId: string,
  tx: typeof prisma | Prisma.TransactionClient = prisma
): Promise<{ id: string }> {
  const existing = await tx.userVessel.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
    select: { id: true },
  });
  if (existing) return existing;
  return tx.userVessel.create({ data: { userId, sessionId }, select: { id: true } });
}

export async function assertNeedsEditable(sessionId: string, userId: string): Promise<void> {
  const progress = await prisma.stageProgress.findUnique({
    where: { sessionId_userId_stage: { sessionId, userId, stage: 3 } },
    select: { stage: true, gatesSatisfied: true },
  });

  if (!progress) {
    throw new NeedEditValidationError('Stage 3 progress was not found.');
  }

  const gates = (progress.gatesSatisfied as Record<string, unknown> | null) ?? {};
  if (gates.needsShared === true) {
    throw new NeedEditForbiddenError('Needs have already been shared and can no longer be edited.');
  }
}

function isNeedCategory(value: unknown): value is NeedCategory {
  return typeof value === 'string' && Object.values(NeedCategory).includes(value as NeedCategory);
}

function normalizeCategory(value: unknown, fallback: NeedCategory = NeedCategory.MEANING): NeedCategory {
  return isNeedCategory(value) ? value : fallback;
}

function cleanNeedText(value: unknown): string {
  return cleanVisibleAIText(typeof value === 'string' ? value : '').trim();
}

function toDTO(row: NeedRow): IdentifiedNeedDTO {
  const warned = withNeedReframingWarning(row);
  return {
    id: row.id,
    need: row.need,
    category: row.category,
    description: row.need,
    evidence: row.evidence,
    confirmed: row.confirmed,
    aiConfidence: row.aiConfidence,
    needsReframing: warned.needsReframing,
    reframingWarning: warned.reframingWarning,
  };
}

export function previewNeedEditOperations(
  operations: NeedEditOperation[],
  needs: NeedRow[]
): AffectedNeed[] {
  const byId = new Map(needs.map((need) => [need.id, need]));
  const affected: AffectedNeed[] = [];

  for (const operation of operations) {
    if (operation.type === 'updateNeedText') {
      const current = operation.needId ? byId.get(operation.needId) : undefined;
      if (!current) throw new NeedEditValidationError('A target need could not be found.');
      const newText = cleanNeedText(operation.newText);
      if (!newText) throw new NeedEditValidationError('Updated need text is required.');
      if (newText.length > 500) throw new NeedEditValidationError('Updated need text is too long.');
      const newCategory = normalizeCategory(operation.newCategory, current.category);
      const validation = validateNeedIsUniversal(newText);
      affected.push({
        needId: current.id,
        before: { text: current.need, category: current.category },
        after: { text: newText, category: newCategory },
        operation: newCategory !== current.category ? 'category_change' : 'text_change',
        warning: validation.warning,
      });
      continue;
    }

    if (operation.type === 'addNeed') {
      const text = cleanNeedText(operation.text);
      if (!text) throw new NeedEditValidationError('New need text is required.');
      if (text.length > 500) throw new NeedEditValidationError('New need text is too long.');
      const category = normalizeCategory(operation.category, NeedCategory.MEANING);
      const validation = validateNeedIsUniversal(text);
      affected.push({
        after: { text, category },
        operation: 'add',
        warning: validation.warning,
      });
      continue;
    }

    if (operation.type === 'removeNeed') {
      const current = operation.needId ? byId.get(operation.needId) : undefined;
      if (!current) throw new NeedEditValidationError('A target need could not be found.');
      affected.push({
        needId: current.id,
        before: { text: current.need, category: current.category },
        operation: 'remove',
      });
      continue;
    }

    throw new NeedEditValidationError('Unsupported need edit operation.');
  }

  return affected;
}

export async function applyNeedEdits(
  sessionId: string,
  userId: string,
  operations: NeedEditOperation[]
): Promise<ApplyNeedEditsResponse> {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new NeedEditValidationError('At least one edit operation is required.');
  }

  await assertNeedsEditable(sessionId, userId);

  const applied = await prisma.$transaction(async (tx) => {
    const vessel = await getOrCreateUserVessel(sessionId, userId, tx);
    const currentNeeds = (await tx.identifiedNeed.findMany({
      where: { vesselId: vessel.id },
      orderBy: { createdAt: 'asc' },
    })) as NeedRow[];

    const preview = previewNeedEditOperations(operations, currentNeeds);

    for (const operation of operations) {
      if (operation.type === 'updateNeedText') {
        const current = currentNeeds.find((need) => need.id === operation.needId);
        if (!current || !operation.needId) continue;
        await tx.identifiedNeed.update({
          where: { id: operation.needId },
          data: {
            need: cleanNeedText(operation.newText),
            category: normalizeCategory(operation.newCategory, current.category),
            confirmed: true,
          },
        });
      } else if (operation.type === 'addNeed') {
        await tx.identifiedNeed.create({
          data: {
            vesselId: vessel.id,
            need: cleanNeedText(operation.text),
            category: normalizeCategory(operation.category, NeedCategory.MEANING),
            evidence: [],
            aiConfidence: 0.9,
            confirmed: true,
          },
        });
      } else if (operation.type === 'removeNeed' && operation.needId) {
        await tx.identifiedNeed.delete({ where: { id: operation.needId } });
      }
    }

    return preview;
  });

  const vessel = await getOrCreateUserVessel(sessionId, userId);
  const needs = (await prisma.identifiedNeed.findMany({
    where: { vesselId: vessel.id },
    orderBy: { createdAt: 'asc' },
  })) as NeedRow[];

  return {
    needs: needs.map(toDTO),
    applied,
    warnings: applied.map((item) => item.warning).filter((warning): warning is string => Boolean(warning)),
  };
}

export async function deleteNeed(sessionId: string, userId: string, needId: string): Promise<void> {
  await assertNeedsEditable(sessionId, userId);
  const vessel = await getOrCreateUserVessel(sessionId, userId);
  const need = await prisma.identifiedNeed.findFirst({
    where: { id: needId, vesselId: vessel.id },
    select: { id: true },
  });
  if (!need) throw new NeedEditValidationError('Need not found.');
  await prisma.identifiedNeed.delete({ where: { id: needId } });
}
