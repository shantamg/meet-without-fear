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

import crypto from 'crypto';
import { logger } from '../lib/logger';
import { getHaikuJson, BrainActivityCallType } from '../lib/bedrock';
import { withHaikuCircuitBreaker } from '../utils/circuit-breaker';
import { prisma } from '../lib/prisma';
import { detectRecurringTheme } from './theme-detector';
import { embedTakeawayBatch, findSimilarTakeaways } from './embedding';
import type { TakeawayDTO, TakeawayType } from '@meet-without-fear/shared';

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
  type?: 'insight' | 'action_item' | 'intention';
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

  const VALID_TYPES = new Set(['insight', 'action_item', 'intention']);

  const valid = candidates
    .filter(
      (item): item is RawTakeaway =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as RawTakeaway).content === 'string',
    )
    .map((item) => ({
      ...item,
      // Normalize type — default to 'insight' if missing or invalid
      type: item.type && VALID_TYPES.has(item.type) ? item.type : ('insight' as const),
    }))
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
- Classify each takeaway as one of:
  - "insight" — a reflection, observation, or realization
  - "action_item" — something concrete to do (e.g., "I need to talk to my manager")
  - "intention" — a desire or aspiration that isn't a concrete action (e.g., "I want to be more patient")

Output ONLY valid JSON in this exact shape:
{
  "takeaways": [
    { "content": "...", "theme": "...", "type": "insight" },
    { "content": "...", "type": "action_item" }
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
  userId,
  turnId,
}: DistillSessionInput): Promise<TakeawayDTO[]> {
  logger.info(`[Distillation] Starting distillation for session ${sessionId}`);

  // 1. Fetch messages
  const messages = await prisma.innerWorkMessage.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
  });

  // 2. Guard: sparse session (< 2 user messages)
  const userMessages = messages.filter((m) => m.role === 'USER');
  if (userMessages.length < 2) {
    logger.info(
      `[Distillation] Skipping Haiku — session ${sessionId} has only ${userMessages.length} user message(s)`,
    );
    await prisma.innerWorkSession.update({
      where: { id: sessionId },
      data: { distilledAt: new Date() },
    });
    return [];
  }

  // 3. Call Haiku with circuit breaker
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
        callType: BrainActivityCallType.DISTILLATION,
      }),
    null,
    'distillation',
  );

  // 4. Normalize
  const normalized = normalizeTakeaways(raw);

  // 5. Empty after normalization — just update distilledAt
  if (normalized.length === 0) {
    logger.info(`[Distillation] No valid takeaways from Haiku for session ${sessionId}`);
    await prisma.innerWorkSession.update({
      where: { id: sessionId },
      data: { distilledAt: new Date() },
    });
    return [];
  }

  // 6. Atomic transaction: replace AI takeaways, update distilledAt
  await prisma.$transaction([
    prisma.sessionTakeaway.deleteMany({
      where: { sessionId, source: 'AI' },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.sessionTakeaway.createMany({
      data: normalized.map((t, i) => ({
        sessionId,
        content: t.content,
        theme: t.theme ?? null,
        source: 'AI' as const,
        // 'type' column added in migration — cast needed until prisma generate runs
        type: (t.type?.toUpperCase() ?? 'INSIGHT'),
        position: i,
      } as any)),
    }),
    prisma.innerWorkSession.update({
      where: { id: sessionId },
      data: { distilledAt: new Date() },
    }),
  ]);

  // Fire-and-forget theme detection — check for recurring themes across sessions (INTEL-01)
  // CRITICAL: Trigger AFTER transaction commits so theme detector sees the new takeaways
  // CRITICAL: Never await — must not slow down distillation response
  detectRecurringTheme({
    sessionId,
    userId,
    turnId: crypto.randomUUID(),
  }).catch(
    (err: unknown) => logger.warn('[Distillation] Fire-and-forget theme detection failed:', err),
  );

  // 7. Fetch and return all takeaways (preserves USER-origin alongside new AI ones)
  const allTakeaways = await prisma.sessionTakeaway.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
  });

  logger.info(
    `[Distillation] Session ${sessionId} distilled: ${allTakeaways.length} takeaway(s)`,
  );

  // 8. Fire-and-forget: embed takeaways and auto-link to similar existing takeaways
  const newAiTakeaways = allTakeaways.filter((t) => t.source === 'AI');
  if (newAiTakeaways.length > 0) {
    embedAndLinkTakeaways(
      newAiTakeaways.map((t) => ({ id: t.id, content: t.content })),
      userId,
      sessionId,
    ).catch(
      (err: unknown) => logger.warn('[Distillation] Fire-and-forget embed+link failed:', err),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return allTakeaways.map((t: any) => mapTakeawayToDTO(t));
}

// ============================================================================
// Helpers
// ============================================================================

function mapTakeawayToDTO(t: {
  id: string;
  content: string;
  theme: string | null;
  source: string;
  type: string;
  position: number;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TakeawayDTO {
  return {
    id: t.id,
    content: t.content,
    theme: t.theme,
    source: t.source as 'AI' | 'USER',
    type: t.type as TakeawayType,
    position: t.position,
    resolved: t.resolved,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export { mapTakeawayToDTO };

/**
 * Embed new takeaways and create auto-links to similar existing ones.
 * Called fire-and-forget after distillation transaction commits.
 */
async function embedAndLinkTakeaways(
  takeaways: Array<{ id: string; content: string }>,
  userId: string,
  sessionId: string,
): Promise<void> {
  // Step 1: Embed all new takeaways
  const embeddedIds = await embedTakeawayBatch(takeaways);
  logger.info(`[Distillation] Embedded ${embeddedIds.length}/${takeaways.length} takeaways`);

  // Step 2: For each embedded takeaway, find and create links to similar ones
  for (const takeawayId of embeddedIds) {
    const matches = await findSimilarTakeaways(takeawayId, userId, sessionId);
    if (matches.length === 0) continue;

    // Create TakeawayLink records (bidirectional: we store source→target)
    for (const match of matches) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).takeawayLink.create({
          data: {
            sourceId: takeawayId,
            targetId: match.takeawayId,
            linkType: 'AI_SEMANTIC',
            similarity: match.similarity,
          },
        });
        logger.info(
          `[Distillation] Auto-linked takeaway ${takeawayId} → ${match.takeawayId} (similarity: ${match.similarity.toFixed(3)})`,
        );
      } catch (err: unknown) {
        // Unique constraint violation = link already exists — safe to ignore
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
          continue;
        }
        throw err;
      }
    }
  }
}
