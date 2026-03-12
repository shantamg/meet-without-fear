/**
 * Distillation Service
 *
 * Extracts key takeaways from an inner thoughts session using Haiku.
 * The prompt is designed to use the user's own words — organizational,
 * not interpretive — no clinical language or psychological labels.
 *
 * Two trigger paths:
 * 1. Fire-and-forget on session COMPLETED (via inner-work controller)
 * 2. On-demand via POST /inner-thoughts/:id/distill (synchronous)
 *
 * Re-distillation: replaces all AI-origin takeaways, preserves USER-origin.
 */

import { logger } from '../lib/logger';
import { getHaikuJson, BrainActivityCallType } from '../lib/bedrock';
import { withHaikuCircuitBreaker } from '../utils/circuit-breaker';
import { prisma } from '../lib/prisma';
import type { TakeawayDTO } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export interface DistillSessionInput {
  sessionId: string;
  userId: string;
  turnId: string;
}

interface RawTakeaway {
  content: string;
  theme?: string | null;
}

// ============================================================================
// normalizeTakeaways
//
// Defensive parser for Haiku output. Handles:
//   - { takeaways: [...] }  (primary shape)
//   - [...]                  (top-level array fallback)
//   - null / undefined / other → empty array
//   - Hard cap at 10 takeaways
//   - Filters items missing a `content` string
// ============================================================================

export function normalizeTakeaways(raw: unknown): RawTakeaway[] {
  if (raw === null || raw === undefined) return [];

  let candidates: unknown[] = [];

  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (
    typeof raw === 'object' &&
    'takeaways' in (raw as object) &&
    Array.isArray((raw as { takeaways: unknown }).takeaways)
  ) {
    candidates = (raw as { takeaways: unknown[] }).takeaways;
  } else {
    return [];
  }

  if (candidates.length === 0) return [];

  const valid = candidates
    .filter(
      (item): item is RawTakeaway =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as RawTakeaway).content === 'string',
    )
    .slice(0, 10); // hard cap

  return valid;
}

// ============================================================================
// buildDistillationPrompt
//
// Formats session messages as a transcript and appends distillation rules.
// AI messages are labeled "Journal Guide", USER messages are labeled "Me".
// ============================================================================

export function buildDistillationPrompt(
  messages: Array<{ role: string; content: string }>,
): string {
  const transcript = messages
    .map((m) => {
      const speaker = m.role === 'USER' ? 'Me' : 'Journal Guide';
      return `${speaker}: ${m.content}`;
    })
    .join('\n');

  return `Here is a journal conversation I had:

${transcript}

Please extract 3-7 key takeaways from this conversation. These should be organizational summaries using my own words and verbatim key phrases wherever possible — not psychological interpretations or clinical labels.

Rules:
- Use the person's OWN words and phrases, not clinical interpretations
- ONE sentence per takeaway
- 3-7 takeaways (fewer is better if the session was brief)
- NO psychological labels (e.g., "attachment wound", "codependency", "trauma response")
- NO clinical language — treat this as an organizational tool, not therapy
- Organize by theme if multiple topics came up

Output ONLY valid JSON in this exact shape:
{
  "takeaways": [
    { "content": "...", "theme": "..." },
    { "content": "..." }
  ]
}`;
}

// ============================================================================
// distillSession
//
// Main distillation function. Called fire-and-forget on session close OR
// synchronously via the distill endpoint.
//
// Flow:
// 1. Fetch messages (ordered by timestamp asc)
// 2. Guard: if < 2 user messages, update distilledAt and return []
// 3. Call Haiku via circuit breaker
// 4. Normalize output
// 5. If empty after normalize, update distilledAt and return []
// 6. Atomic transaction: delete AI takeaways, createMany new, update distilledAt
// 7. Fetch and return all takeaways (all sources, ordered by position)
// ============================================================================

export async function distillSession({
  sessionId,
  userId: _userId,
  turnId,
}: DistillSessionInput): Promise<TakeawayDTO[]> {
  logger.info(`[Distillation] Starting distillation for session ${sessionId}`);

  // 1. Fetch messages
  const messages = await prisma.innerWorkMessage.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
  });

  // 2. Guard: sparse session (< 2 user messages)
  // Use `as any` for fields added by pending migration (distilledAt, BrainActivityCallType.DISTILLATION)
  // that are not yet reflected in the generated Prisma client types.
  const prismaAny = prisma as any;
  const userMessages = messages.filter((m) => m.role === 'USER');
  if (userMessages.length < 2) {
    logger.info(
      `[Distillation] Skipping Haiku — session ${sessionId} has only ${userMessages.length} user message(s)`,
    );
    await prismaAny.innerWorkSession.update({
      where: { id: sessionId },
      data: { distilledAt: new Date() },
    });
    return [];
  }

  // 3. Call Haiku with circuit breaker
  // BrainActivityCallType.DISTILLATION is added by the pending migration; use `as any` to bypass
  // the generated client types until `prisma generate` runs after the migration is applied.
  const raw = await withHaikuCircuitBreaker(
    async () =>
      getHaikuJson<{ takeaways: Array<{ content: string; theme?: string }> }>({
        systemPrompt:
          'You are an organizational assistant. You ONLY output valid JSON. Never add psychological labels, clinical terms, or interpretations. Extract verbatim phrases in the user\'s own language.',
        messages: [{ role: 'user', content: buildDistillationPrompt(messages) }],
        maxTokens: 1024,
        innerWorkSessionId: sessionId,
        turnId,
        operation: 'distillation',
        callType: 'DISTILLATION' as unknown as BrainActivityCallType,
      }),
    null,
    'distillation',
  );

  // 4. Normalize
  const normalized = normalizeTakeaways(raw);

  // 5. Empty after normalization — just update distilledAt
  if (normalized.length === 0) {
    logger.info(`[Distillation] No valid takeaways from Haiku for session ${sessionId}`);
    await prismaAny.innerWorkSession.update({
      where: { id: sessionId },
      data: { distilledAt: new Date() },
    });
    return [];
  }

  // 6. Atomic transaction: replace AI takeaways, update distilledAt
  await prisma.$transaction([
    prismaAny.sessionTakeaway.deleteMany({
      where: { sessionId, source: 'AI' },
    }),
    prismaAny.sessionTakeaway.createMany({
      data: normalized.map((t, i) => ({
        sessionId,
        content: t.content,
        theme: t.theme ?? null,
        source: 'AI',
        position: i,
      })),
    }),
    prismaAny.innerWorkSession.update({
      where: { id: sessionId },
      data: { distilledAt: new Date() },
    }),
  ]);

  // 7. Fetch and return all takeaways (preserves USER-origin alongside new AI ones)
  const allTakeaways = await prismaAny.sessionTakeaway.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
  });

  logger.info(
    `[Distillation] Session ${sessionId} distilled: ${allTakeaways.length} takeaway(s)`,
  );

  return allTakeaways.map(
    (t: {
      id: string;
      content: string;
      theme: string | null;
      source: string;
      position: number;
      createdAt: Date;
      updatedAt: Date;
    }): TakeawayDTO => ({
      id: t.id,
      content: t.content,
      theme: t.theme,
      source: t.source as 'AI' | 'USER',
      position: t.position,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }),
  );
}
