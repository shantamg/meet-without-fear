/**
 * Embedding Service
 *
 * Generates and stores embeddings for semantic search.
 * Uses Titan for embedding generation and pgvector for storage/querying.
 *
 * Architecture: Session-Level Embeddings (Fact-Ledger)
 * - Session-level content embeddings replace message-level embeddings
 * - Facts + summary are embedded at the session level for retrieval
 * - Message-level embedding functions have been deprecated and removed
 */

import { prisma } from '../lib/prisma';
import { getEmbedding } from '../lib/bedrock';

// ============================================================================
// Types
// ============================================================================

export interface SessionSummary {
  id: string;
  partnerName: string;
  topic?: string;
  recentContext?: string;
  status: string;
}

export interface SimilarSession {
  sessionId: string;
  partnerName: string;
  similarity: number;
}

/** A categorized fact from the fact-ledger */
export interface CategorizedFact {
  category: string;
  fact: string;
}

/** Result from session content search */
export interface SessionContentMatch {
  sessionId: string;
  vesselId: string;
  similarity: number;
  partnerName: string;
  facts?: CategorizedFact[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a number array to SQL vector format.
 * pgvector expects format: '[1.0, 2.0, 3.0, ...]'
 */
function vectorToSql(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Check if embeddings are enabled (Bedrock credentials available).
 */
export async function isEmbeddingEnabled(): Promise<boolean> {
  const testEmbedding = await getEmbedding('test');
  return testEmbedding !== null;
}

// ============================================================================
// Session Content Embeddings (NEW - Fact-Ledger Architecture)
// ============================================================================

/**
 * Build text to embed for session content.
 * Combines facts and summary into a single embeddable document.
 */
function buildSessionContentText(
  facts: CategorizedFact[] | null,
  summaryText: string | null,
  partnerName: string
): string {
  const parts: string[] = [];

  parts.push(`Session with ${partnerName}`);

  // Add facts by category
  if (facts && facts.length > 0) {
    const factsByCategory: Record<string, string[]> = {};
    for (const f of facts) {
      if (!factsByCategory[f.category]) {
        factsByCategory[f.category] = [];
      }
      factsByCategory[f.category].push(f.fact);
    }

    for (const [category, categoryFacts] of Object.entries(factsByCategory)) {
      parts.push(`${category}: ${categoryFacts.join('; ')}`);
    }
  }

  // Add summary
  if (summaryText) {
    parts.push(`Summary: ${summaryText}`);
  }

  return parts.join('\n');
}

/**
 * Embed session content (facts + summary) for a UserVessel.
 * Call this after facts or summary are updated.
 *
 * @param sessionId - The session to embed
 * @param userId - The user whose vessel to embed
 * @param turnId - Optional turn ID for cost attribution
 */
export async function embedSessionContent(
  sessionId: string,
  userId: string,
  turnId?: string
): Promise<boolean> {
  console.log('[Embedding] Starting embedSessionContent for session:', sessionId);

  // Get vessel with facts and summary
  const vessel = await prisma.userVessel.findUnique({
    where: {
      userId_sessionId: { userId, sessionId },
    },
    select: {
      id: true,
      notableFacts: true,
      conversationSummary: true,
      session: {
        include: {
          relationship: {
            include: {
              members: { include: { user: true } },
            },
          },
        },
      },
    },
  });

  if (!vessel) {
    console.warn(`[Embedding] No vessel found for session ${sessionId}, user ${userId}`);
    return false;
  }

  // Get partner name
  const partner = vessel.session.relationship.members.find((m) => m.userId !== userId);
  const myMember = vessel.session.relationship.members.find((m) => m.userId === userId);
  const partnerName =
    partner?.user.firstName ||
    partner?.user.name ||
    partner?.nickname ||
    myMember?.nickname ||
    'Unknown';

  // Parse facts (stored as JSON)
  let facts: CategorizedFact[] | null = null;
  if (vessel.notableFacts) {
    try {
      // notableFacts is Prisma JsonValue, cast through unknown
      facts = vessel.notableFacts as unknown as CategorizedFact[];
    } catch {
      console.warn(`[Embedding] Failed to parse notableFacts for vessel ${vessel.id}`);
    }
  }

  // Parse summary
  let summaryText: string | null = null;
  if (vessel.conversationSummary) {
    try {
      const summaryData = JSON.parse(vessel.conversationSummary as string);
      summaryText = summaryData.text || null;
    } catch {
      // If not JSON, use as-is
      summaryText = vessel.conversationSummary as string;
    }
  }

  // Skip if no content to embed
  if (!facts?.length && !summaryText) {
    console.log(`[Embedding] No content to embed for session ${sessionId}`);
    return false;
  }

  // Build embedding text
  const embeddingText = buildSessionContentText(facts, summaryText, partnerName);

  // Generate embedding
  const embedding = await getEmbedding(embeddingText, { sessionId, turnId });
  if (!embedding) {
    console.warn(`[Embedding] Failed to generate embedding for session ${sessionId}`);
    return false;
  }

  // Store embedding
  await prisma.$executeRaw`
    UPDATE "UserVessel"
    SET "contentEmbedding" = ${vectorToSql(embedding)}::vector
    WHERE id = ${vessel.id}
  `;

  console.log(`[Embedding] Embedded session content for vessel ${vessel.id}`);
  return true;
}

/**
 * Search session content across a user's sessions.
 * Returns sessions with similar content based on facts + summary embeddings.
 *
 * @param userId - The user to search sessions for
 * @param queryText - The query text to search
 * @param limit - Maximum results to return
 * @param threshold - Minimum similarity threshold (0-1)
 * @param turnId - Optional turn ID for cost attribution
 */
export async function searchSessionContent(
  userId: string,
  queryText: string,
  limit: number = 5,
  threshold: number = 0.5,
  turnId?: string
): Promise<SessionContentMatch[]> {
  console.log('[Embedding] searchSessionContent for:', queryText.slice(0, 50));

  const queryEmbedding = await getEmbedding(queryText, { turnId });
  if (!queryEmbedding) {
    console.warn('[Embedding] Failed to generate query embedding');
    return [];
  }

  // Query using cosine similarity on contentEmbedding
  const results = await prisma.$queryRaw<
    Array<{
      session_id: string;
      vessel_id: string;
      partner_name: string;
      notable_facts: unknown;
      distance: number;
    }>
  >`
    SELECT
      s.id as session_id,
      uv.id as vessel_id,
      COALESCE(partner_user.name, partner_member.nickname, my_member.nickname, 'Unknown') as partner_name,
      uv."notableFacts" as notable_facts,
      uv."contentEmbedding" <=> ${vectorToSql(queryEmbedding)}::vector as distance
    FROM "UserVessel" uv
    JOIN "Session" s ON uv."sessionId" = s.id
    JOIN "Relationship" r ON s."relationshipId" = r.id
    JOIN "RelationshipMember" my_member ON r.id = my_member."relationshipId" AND my_member."userId" = ${userId}
    LEFT JOIN "RelationshipMember" partner_member ON r.id = partner_member."relationshipId" AND partner_member."userId" != ${userId}
    LEFT JOIN "User" partner_user ON partner_member."userId" = partner_user.id
    WHERE uv."userId" = ${userId}
      AND uv."contentEmbedding" IS NOT NULL
      AND s.status NOT IN ('ABANDONED', 'RESOLVED')
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  // Convert distance to similarity and filter by threshold
  return results
    .map((r) => {
      const similarity = 1 - r.distance / 2;
      return {
        sessionId: r.session_id,
        vesselId: r.vessel_id,
        partnerName: r.partner_name,
        similarity,
        facts: r.notable_facts as CategorizedFact[] | undefined,
      };
    })
    .filter((r) => r.similarity >= threshold);
}

// ============================================================================
// Inner Work Session Content Embeddings
// ============================================================================

/**
 * Embed Inner Work session content (theme + summary) for semantic search.
 *
 * @param sessionId - The Inner Work session to embed
 * @param turnId - Optional turn ID for cost attribution
 */
export async function embedInnerWorkSessionContent(
  sessionId: string,
  turnId?: string
): Promise<boolean> {
  console.log('[Embedding] Starting embedInnerWorkSessionContent for session:', sessionId);

  const session = await prisma.innerWorkSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      theme: true,
      summary: true,
      conversationSummary: true,
    },
  });

  if (!session) {
    console.warn(`[Embedding] Inner work session ${sessionId} not found`);
    return false;
  }

  // Build embedding text from theme and summaries
  const parts: string[] = [];

  if (session.theme) {
    parts.push(`Theme: ${session.theme}`);
  }

  if (session.summary) {
    parts.push(`Summary: ${session.summary}`);
  }

  // Parse conversation summary if available
  if (session.conversationSummary) {
    try {
      const summaryData = JSON.parse(session.conversationSummary as string);
      if (summaryData.text) {
        parts.push(`Conversation: ${summaryData.text}`);
      }
      if (summaryData.keyThemes?.length) {
        parts.push(`Themes: ${summaryData.keyThemes.join(', ')}`);
      }
    } catch {
      // If not JSON, use as-is
      parts.push(session.conversationSummary as string);
    }
  }

  // Skip if no content to embed
  if (parts.length === 0) {
    console.log(`[Embedding] No content to embed for Inner Work session ${sessionId}`);
    return false;
  }

  const embeddingText = parts.join('\n');

  // Generate embedding
  const embedding = await getEmbedding(embeddingText, { sessionId, turnId });
  if (!embedding) {
    console.warn(`[Embedding] Failed to generate embedding for Inner Work session ${sessionId}`);
    return false;
  }

  // Store embedding
  await prisma.$executeRaw`
    UPDATE "InnerWorkSession"
    SET "contentEmbedding" = ${vectorToSql(embedding)}::vector
    WHERE id = ${sessionId}
  `;

  console.log(`[Embedding] Embedded Inner Work session content for ${sessionId}`);
  return true;
}

/**
 * Search Inner Work session content for a user.
 * Returns sessions with similar theme/summary based on embeddings.
 *
 * @param userId - The user to search sessions for
 * @param queryText - The query text to search
 * @param linkedPartnerSessionId - Optional partner session ID for boost
 * @param boostFactor - Similarity boost for linked sessions (default 1.3 = 30% boost)
 * @param limit - Maximum results to return
 * @param threshold - Minimum similarity threshold (0-1)
 * @param turnId - Optional turn ID for cost attribution
 */
export async function searchInnerWorkSessionContent(
  userId: string,
  queryText: string,
  linkedPartnerSessionId?: string,
  boostFactor: number = 1.3,
  limit: number = 5,
  threshold: number = 0.5,
  turnId?: string
): Promise<Array<{
  sessionId: string;
  theme: string | null;
  similarity: number;
  isLinked: boolean;
}>> {
  console.log('[Embedding] searchInnerWorkSessionContent for:', queryText.slice(0, 50));

  const queryEmbedding = await getEmbedding(queryText, { turnId });
  if (!queryEmbedding) {
    console.warn('[Embedding] Failed to generate query embedding');
    return [];
  }

  // Query using cosine similarity on contentEmbedding
  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      theme: string | null;
      distance: number;
      is_linked: boolean;
    }>
  >`
    SELECT
      s.id,
      s.theme,
      s."contentEmbedding" <=> ${vectorToSql(queryEmbedding)}::vector as distance,
      ${linkedPartnerSessionId ? `(s."linkedPartnerSessionId" = ${linkedPartnerSessionId})` : 'false'} as is_linked
    FROM "InnerWorkSession" s
    WHERE s."userId" = ${userId}
      AND s."contentEmbedding" IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${limit * 2}
  `;

  // Apply boost to linked sessions and re-sort
  return results
    .map((r) => {
      const baseSimilarity = 1 - r.distance / 2;
      // Apply boost for linked sessions
      const similarity = r.is_linked ? Math.min(baseSimilarity * boostFactor, 1) : baseSimilarity;
      return {
        sessionId: r.id,
        theme: r.theme,
        similarity,
        isLinked: r.is_linked,
      };
    })
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// ============================================================================
// Legacy Session Embeddings (for backward compatibility during migration)
// ============================================================================

/**
 * Generate a text summary for a session to embed.
 * Combines partner name, topic, and recent context.
 * @deprecated Use embedSessionContent instead
 */
function buildSessionEmbeddingText(session: SessionSummary): string {
  const parts: string[] = [];

  parts.push(`Session with ${session.partnerName}`);

  if (session.topic) {
    parts.push(`Topic: ${session.topic}`);
  }

  if (session.recentContext) {
    parts.push(`Recent: ${session.recentContext}`);
  }

  parts.push(`Status: ${session.status}`);

  return parts.join('. ');
}

/**
 * Find sessions similar to the given query text.
 * Searches across all of a user's session vessels.
 * @deprecated Use searchSessionContent instead
 */
export async function findSimilarSessions(
  userId: string,
  queryText: string,
  limit: number = 5,
  threshold: number = 0.7,
  turnId?: string
): Promise<SimilarSession[]> {
  console.log('[Embedding] findSimilarSessions - generating query embedding');
  const queryEmbedding = await getEmbedding(queryText, { turnId });
  if (!queryEmbedding) {
    console.warn('[Embedding] Failed to generate query embedding (Bedrock not configured?)');
    return [];
  }
  console.log('[Embedding] Query embedding generated, dimensions:', queryEmbedding.length);

  // Try new contentEmbedding first, fall back to legacy embedding
  const results = await prisma.$queryRaw<
    Array<{ session_id: string; partner_name: string; distance: number }>
  >`
    SELECT
      s.id as session_id,
      COALESCE(partner_user.name, partner_member.nickname, my_member.nickname, 'Unknown') as partner_name,
      COALESCE(uv."contentEmbedding", uv.embedding) <=> ${vectorToSql(queryEmbedding)}::vector as distance
    FROM "UserVessel" uv
    JOIN "Session" s ON uv."sessionId" = s.id
    JOIN "Relationship" r ON s."relationshipId" = r.id
    JOIN "RelationshipMember" my_member ON r.id = my_member."relationshipId" AND my_member."userId" = ${userId}
    LEFT JOIN "RelationshipMember" partner_member ON r.id = partner_member."relationshipId" AND partner_member."userId" != ${userId}
    LEFT JOIN "User" partner_user ON partner_member."userId" = partner_user.id
    WHERE uv."userId" = ${userId}
      AND (uv."contentEmbedding" IS NOT NULL OR uv.embedding IS NOT NULL)
      AND s.status NOT IN ('ABANDONED', 'RESOLVED')
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return results
    .map((r) => ({
      sessionId: r.session_id,
      partnerName: r.partner_name,
      similarity: 1 - r.distance / 2,
    }))
    .filter((r) => r.similarity >= threshold);
}

/**
 * Find sessions where the partner name or topic matches semantically.
 * Used by the chat router to find relevant sessions.
 * @deprecated Use searchSessionContent instead
 */
export async function findRelevantSessions(
  userId: string,
  userMessage: string,
  limit: number = 3,
  turnId?: string
): Promise<SimilarSession[]> {
  console.log('[Embedding] findRelevantSessions for:', userMessage.slice(0, 50));

  // First try vector search
  const vectorResults = await findSimilarSessions(userId, userMessage, limit, 0.5, turnId);

  console.log('[Embedding] Vector search results:', vectorResults.length);

  if (vectorResults.length > 0) {
    return vectorResults;
  }

  return [];
}
