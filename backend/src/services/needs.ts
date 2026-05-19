/**
 * Needs Service
 *
 * Types and utilities for Stage 3 needs.
 * Extraction and common ground analysis have been removed as part of
 * the Stage 3 redesign (#247). Needs are now captured via the
 * conversational AI (summary cards) rather than a separate extraction step.
 */

import { resetBedrockClient } from '../lib/bedrock';
import { prisma } from '../lib/prisma';
import { NeedCategory, type CapturedNeedInput } from '@meet-without-fear/shared';
import { cleanVisibleAIText } from '../utils/visible-text';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedNeed {
  category: NeedCategory;
  need: string;
  evidence: string[];
  aiConfidence: number;
}

export interface IdentifiedNeedRecord {
  id: string;
  vesselId: string;
  need: string;
  category: NeedCategory;
  evidence: string[];
  aiConfidence: number;
  confirmed: boolean;
  createdAt: Date;
  needsReframing?: boolean;
  reframingWarning?: string;
}

export interface CaptureProposedNeedsResult {
  needs: IdentifiedNeedRecord[];
  capturedAt: Date;
}

export interface UniversalNeedValidationResult {
  ok: boolean;
  warning?: string;
}

const OTHER_PERSON_PATTERNS = [
  /\bi need\s+(him|her|them|you|my partner)\s+to\b/i,
  /\bi need\s+(him|her|them|you|my partner)\s+not\s+to\b/i,
  /\bi need\s+(him|her|them|you|my partner)\s+to\s+stop\b/i,
  /\bi need\s+.*\b(stop|quit|change|apologize|admit|listen|understand)\b/i,
  /\bso (he|she|they|you) (will|would|can|could|won't|don't|doesn't)\b/i,
];

export function validateNeedIsUniversal(need: string): UniversalNeedValidationResult {
  const text = cleanVisibleAIText(need).trim();
  if (!text) return { ok: false, warning: 'Need text is empty.' };

  if (OTHER_PERSON_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      ok: false,
      warning:
        'This may still be framed around what the other person should do. Reword it toward what matters to you.',
    };
  }

  return { ok: true };
}

export function withNeedReframingWarning<T extends { need: string }>(
  need: T
): T & { needsReframing: boolean; reframingWarning?: string } {
  const validation = validateNeedIsUniversal(need.need);
  return {
    ...need,
    needsReframing: !validation.ok,
    reframingWarning: validation.warning,
  };
}

async function getOrCreateUserVessel(
  sessionId: string,
  userId: string
): Promise<{ id: string }> {
  const existing = await prisma.userVessel.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.userVessel.create({
    data: { userId, sessionId },
    select: { id: true },
  });
}

export async function captureProposedNeedsForUser(
  sessionId: string,
  userId: string,
  needs: CapturedNeedInput[]
): Promise<CaptureProposedNeedsResult> {
  const vessel = await getOrCreateUserVessel(sessionId, userId);
  const capturedAt = new Date();

  await prisma.$transaction(async (tx) => {
    // Replace only unconfirmed AI-captured needs. Once the user confirms, the
    // list becomes user-owned and later chat summaries should not overwrite it.
    await tx.identifiedNeed.deleteMany({
      where: {
        vesselId: vessel.id,
        confirmed: false,
      },
    });

    for (const item of needs) {
      const evidence = Array.isArray(item.evidence)
        ? item.evidence.filter((entry): entry is string => typeof entry === 'string')
        : [];

      await tx.identifiedNeed.create({
        data: {
          vesselId: vessel.id,
          need: cleanVisibleAIText(item.description || item.need),
          category: item.category,
          evidence: evidence.map((entry) => cleanVisibleAIText(entry)).filter(Boolean),
          aiConfidence: 0.85,
          confirmed: false,
        },
      });
    }

    const progress = await tx.stageProgress.findUnique({
      where: {
        sessionId_userId_stage: {
          sessionId,
          userId,
          stage: 3,
        },
      },
    });

    if (progress) {
      const gates = (progress.gatesSatisfied as Record<string, unknown> | null) ?? {};
      await tx.stageProgress.update({
        where: { id: progress.id },
        data: {
          gatesSatisfied: {
            ...gates,
            needsCaptured: true,
            needsCapturedAt: capturedAt.toISOString(),
          },
        },
      });
    }
  });

  const capturedNeeds = await prisma.identifiedNeed.findMany({
    where: { vesselId: vessel.id },
    orderBy: { createdAt: 'asc' },
  });

  return {
    needs: capturedNeeds.map((need) =>
      withNeedReframingWarning({
        ...need,
        category: need.category as unknown as NeedCategory,
      })
    ),
    capturedAt,
  };
}

/**
 * Reset the client (useful for testing)
 */
export function resetNeedsClient(): void {
  resetBedrockClient();
}
