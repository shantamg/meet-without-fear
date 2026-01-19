# Specification: Fact-Ledger Memory Architecture

**Feature:** Optimize Memory and Retrieval
**Status:** Ready for Implementation
**Created:** 2026-01-18
**Approach:** Clean-slate (database can be reset, no backward compatibility)

---

## Overview

Transform the AI memory system from raw message retrieval to a structured fact-ledger approach. This reduces token costs, improves reasoning quality, and creates a searchable semantic layer based on curated facts and summaries rather than noisy individual messages.

**Clean-Slate Commitment:** We are fully committing to session-level retrieval. Message-level embeddings are dead code and will be removed entirely.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fact Schema | Dynamic categories (strict) | Zod-validated `{category, fact}` - throws on invalid format |
| Embedding Strategy | Session-level only | **Delete** Message.embedding column; embed facts+summary as `contentEmbedding` |
| Message Embedding Code | **Delete entirely** | No feature flags - remove dead code from codebase |
| Global Fact Limit | 50 max (~500 tokens) | Aggressive deduplication to stay under token budget |
| Context Injection | Replace Prior Themes | Global Facts take the slot of the placeholder `priorThemes` section |
| Consolidation Trigger | Stage 1 → Stage 2 | Hook into stage advancement; no cron jobs needed |
| Storage | `User.globalFacts` column | Direct column on User table, not separate table |
| Retriever | Single function: `searchSessionContent()` | Delete all message-level search functions |
| Inner Thoughts | Same treatment | Delete `InnerWorkMessage.embedding` column |

---

## User Stories

### US-1: Structured Fact Extraction
**As** the AI system
**I want to** extract facts with dynamic categories
**So that** facts are organized and searchable by type

**Acceptance Criteria:**
- [ ] Classifier outputs `[{ category: string, fact: string }]` format
- [ ] Prompt includes suggested categories: People, Logistics, Conflict, Emotional, History
- [ ] Facts saved to `UserVessel.notableFacts` as JSON
- [ ] **Strict typing:** Zod schema validates shape on load; throws error if invalid format
- [ ] No backward compatibility - old string[] format not supported

### US-2: Content Embedding
**As** the AI system
**I want to** embed combined facts+summary as a single vector
**So that** semantic search returns session-level matches with rich context

**Acceptance Criteria:**
- [ ] New `UserVessel.contentEmbedding` vector column exists
- [ ] Embedding generated from: `FACTS: [...]\n\nSUMMARY: [...]`
- [ ] Embedding updated when facts OR summary changes
- [ ] **Delete** `embedMessage()` calls from `session-processor.ts`
- [ ] **Delete** `embedMessage()` function from `embedding.ts`

### US-3: Global Fact Consolidation
**As** the AI system
**I want to** merge session facts into a global user profile
**So that** the AI knows user context across multiple sessions

**Acceptance Criteria:**
- [ ] `consolidateGlobalFacts()` function in new `global-memory.ts`
- [ ] Triggered on Stage 1 → Stage 2 advancement
- [ ] Haiku merges, deduplicates, prunes to max 50 facts
- [ ] Result saved to `User.globalFacts` JSON column

### US-4: Context Assembly Update
**As** the AI system
**I want to** inject global facts at the top of context
**So that** the AI always has user profile information

**Acceptance Criteria:**
- [ ] `buildPriorThemes()` **deleted** from context-assembler
- [ ] `loadGlobalFacts()` added, called in `assembleContextBundle()`
- [ ] Global facts formatted as `[Category]: Fact...` at top of prompt
- [ ] Token cap enforced: truncate if >500 tokens

### US-5: Retriever Migration
**As** the AI system
**I want to** search `contentEmbedding` only
**So that** semantic search returns session-level matches

**Acceptance Criteria:**
- [ ] New `searchSessionContent()` queries `UserVessel.contentEmbedding`
- [ ] **Delete** `searchAcrossSessions()` (message-based)
- [ ] **Delete** `searchWithinSession()`
- [ ] **Delete** `findSimilarMessages()`
- [ ] Returns session-level matches (sessionId, partnerName, facts snippet, similarity)

### US-6: Schema Cleanup
**As** the system
**I want to** remove dead embedding columns
**So that** the database is clean and doesn't accumulate ghost vectors

**Acceptance Criteria:**
- [ ] **Drop** `Message.embedding` column
- [ ] **Drop** `InnerWorkMessage.embedding` column
- [ ] **Delete** `embedInnerWorkMessage()` function
- [ ] **Delete** `findSimilarInnerWorkMessages()` function
- [ ] **Delete** `searchInnerWorkMessages()` function

### US-7: Inner Thoughts Alignment
**As** the AI system
**I want to** apply the same embedding strategy to Inner Thoughts
**So that** architecture is consistent across session types

**Acceptance Criteria:**
- [ ] `InnerWorkSession.contentEmbedding` column added
- [ ] Raw `InnerWorkMessage` embedding code **deleted**
- [ ] Inner Thoughts summarizer triggers content embedding
- [ ] `searchSessionContent()` works for both session types

---

## Implementation Phases

### Phase 1: Schema Changes (Destructive)
1. Prisma migration: **Drop** `Message.embedding` column
2. Prisma migration: **Drop** `InnerWorkMessage.embedding` column
3. Prisma migration: `UserVessel.notableFacts` from `String[]` to `Json`
4. Prisma migration: Add `User.globalFacts Json?`
5. Prisma migration: Add `UserVessel.contentEmbedding Unsupported("vector(1024)")?`
6. Prisma migration: Add `InnerWorkSession.contentEmbedding Unsupported("vector(1024)")?`

### Phase 2: Delete Dead Code
1. **Delete** `embedMessage()` from `embedding.ts`
2. **Delete** `embedMessages()` from `embedding.ts`
3. **Delete** `embedInnerWorkMessage()` from `embedding.ts`
4. **Delete** `findSimilarMessages()` from `embedding.ts`
5. **Delete** `findSimilarInnerWorkMessages()` from `embedding.ts`
6. **Delete** `findSimilarInnerThoughtsWithBoost()` from `embedding.ts`
7. **Delete** embedding calls from `session-processor.ts` (lines 269-274)
8. **Delete** `searchAcrossSessions()` from `context-retriever.ts`
9. **Delete** `searchWithinSession()` from `context-retriever.ts`
10. **Delete** `searchInnerWorkMessages()` from `context-retriever.ts`

### Phase 3: Fact Extraction Update
1. Update `partner-session-classifier.ts` prompt for category output
2. Update normalizer for strict `[{category, fact}]` format
3. Add Zod schema validation in `loadNotableFacts()`
4. Update `formatContextForPrompt()` to display categorized facts

### Phase 4: New Embedding System
1. Add `embedSessionContent()` to `embedding.ts`
2. Add `searchSessionContent()` to `embedding.ts` (single retrieval function)
3. Call `embedSessionContent()` from `conversation-summarizer.ts` after summary update
4. Call `embedSessionContent()` from `partner-session-classifier.ts` after facts update
5. Update `context-retriever.ts` to use `searchSessionContent()`

### Phase 5: Global Facts
1. Create `global-memory.ts` with `consolidateGlobalFacts()`
2. Hook into stage advancement (Stage 1 → 2)
3. Add `loadGlobalFacts()` to context-assembler
4. Update `formatContextForPrompt()` to include global facts section
5. **Delete** `buildPriorThemes()` and related code

### Phase 6: Inner Thoughts
1. Apply same embedding changes to Inner Thoughts
2. Update Inner Thoughts summarizer for content embedding
3. Ensure `searchSessionContent()` handles both session types

---

## Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | 6 migrations (2 drops, 4 adds) |
| `embedding.ts` | **Delete** 6 functions, **Add** 2 new functions |
| `session-processor.ts` | **Delete** embedding calls (lines 269-274) |
| `context-retriever.ts` | **Delete** 3 search functions, use `searchSessionContent()` |
| `partner-session-classifier.ts` | Prompt update, strict output format |
| `context-assembler.ts` | **Delete** priorThemes, add globalFacts, update format |
| `conversation-summarizer.ts` | Trigger content embedding after summary |
| `global-memory.ts` (new) | `consolidateGlobalFacts()` function |
| Stage advancement logic | Hook consolidator call |
| Inner Thoughts files | Delete embedding calls, add content embedding |

---

## Database Migrations

### Migration 1: Drop Message Embedding (Destructive)
```sql
ALTER TABLE "Message" DROP COLUMN IF EXISTS "embedding";
```

### Migration 2: Drop InnerWorkMessage Embedding (Destructive)
```sql
ALTER TABLE "InnerWorkMessage" DROP COLUMN IF EXISTS "embedding";
```

### Migration 3: Structured Facts
```sql
ALTER TABLE "UserVessel"
  DROP COLUMN IF EXISTS "notableFacts",
  ADD COLUMN "notableFacts" JSONB;
```

### Migration 4: Global Facts
```sql
ALTER TABLE "User" ADD COLUMN "globalFacts" JSONB;
```

### Migration 5: Content Embedding (UserVessel)
```sql
ALTER TABLE "UserVessel" ADD COLUMN "contentEmbedding" vector(1024);
```

### Migration 6: Content Embedding (InnerWorkSession)
```sql
ALTER TABLE "InnerWorkSession" ADD COLUMN "contentEmbedding" vector(1024);
```

---

## Type Definitions

```typescript
import { z } from 'zod';

// Strict schema - throws on invalid data
export const NotableFactSchema = z.object({
  category: z.string().min(1),
  fact: z.string().min(1),
});

export const NotableFactsArraySchema = z.array(NotableFactSchema);

export type NotableFact = z.infer<typeof NotableFactSchema>;

// Usage in loadNotableFacts():
function loadNotableFacts(raw: unknown): NotableFact[] {
  return NotableFactsArraySchema.parse(raw); // Throws if invalid
}
```

---

## New Functions

### `embedSessionContent()` in embedding.ts
```typescript
/**
 * Embed combined facts + summary for session-level semantic search.
 * Replaces message-level embedding entirely.
 */
export async function embedSessionContent(
  sessionId: string,
  userId: string,
  turnId: string
): Promise<boolean> {
  const vessel = await prisma.userVessel.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
    select: { id: true, notableFacts: true, conversationSummary: true },
  });

  if (!vessel) return false;

  // Build combined text
  const facts = vessel.notableFacts as NotableFact[] | null;
  const factsText = facts
    ? facts.map(f => `[${f.category}]: ${f.fact}`).join('\n')
    : '';

  const summary = vessel.conversationSummary
    ? JSON.parse(vessel.conversationSummary as string).text
    : '';

  const embeddingText = `FACTS:\n${factsText}\n\nSUMMARY:\n${summary}`;

  const embedding = await getEmbedding(embeddingText, { sessionId, turnId });
  if (!embedding) return false;

  await prisma.$executeRaw`
    UPDATE "UserVessel"
    SET "contentEmbedding" = ${vectorToSql(embedding)}::vector
    WHERE id = ${vessel.id}
  `;

  return true;
}
```

### `searchSessionContent()` in embedding.ts
```typescript
/**
 * Single retrieval function - searches session-level content embeddings.
 * Returns sessions (not messages) with their facts snippet for context.
 */
export async function searchSessionContent(
  userId: string,
  queryText: string,
  relationshipId: string,
  excludeSessionId?: string,
  limit: number = 5,
  threshold: number = 0.5,
  turnId?: string
): Promise<Array<{
  sessionId: string;
  partnerName: string;
  factsSnippet: string;
  similarity: number;
}>> {
  const queryEmbedding = await getEmbedding(queryText, { turnId });
  if (!queryEmbedding) return [];

  const vectorSql = `[${queryEmbedding.join(',')}]`;

  const results = await prisma.$queryRaw<Array<{
    session_id: string;
    partner_name: string;
    notable_facts: unknown;
    distance: number;
  }>>`
    SELECT
      s.id as session_id,
      COALESCE(partner_user.name, partner_member.nickname, 'Unknown') as partner_name,
      uv."notableFacts" as notable_facts,
      uv."contentEmbedding" <=> ${vectorSql}::vector as distance
    FROM "UserVessel" uv
    JOIN "Session" s ON uv."sessionId" = s.id
    JOIN "Relationship" r ON s."relationshipId" = r.id
    JOIN "RelationshipMember" my_member ON r.id = my_member."relationshipId" AND my_member."userId" = ${userId}
    LEFT JOIN "RelationshipMember" partner_member ON r.id = partner_member."relationshipId" AND partner_member."userId" != ${userId}
    LEFT JOIN "User" partner_user ON partner_member."userId" = partner_user.id
    WHERE uv."userId" = ${userId}
      AND uv."contentEmbedding" IS NOT NULL
      AND s."relationshipId" = ${relationshipId}
      ${excludeSessionId ? Prisma.sql`AND s.id != ${excludeSessionId}` : Prisma.empty}
    ORDER BY distance ASC
    LIMIT ${limit * 2}
  `;

  return results
    .map(r => {
      const facts = r.notable_facts as NotableFact[] | null;
      const factsSnippet = facts
        ? facts.slice(0, 3).map(f => `[${f.category}]: ${f.fact}`).join('; ')
        : '';

      return {
        sessionId: r.session_id,
        partnerName: r.partner_name,
        factsSnippet,
        similarity: 1 - r.distance / 2,
      };
    })
    .filter(r => r.similarity >= threshold)
    .slice(0, limit);
}
```

---

## Prompt Templates

### Fact Extraction Prompt (Updated)
```
TASK 3 - NOTABLE FACTS EXTRACTION:
Maintain a curated list of facts about the user's situation.

Organize facts by category. Use categories like:
- People (names, ages, relationships)
- Logistics (schedules, locations, events)
- Conflict (disagreements, tensions, triggers)
- Emotional (feelings, fears, hopes)
- History (past events, patterns)

You may create additional categories when needed.

Output format:
"notableFacts": [
  { "category": "People", "fact": "Daughter Emma is 14 years old" },
  { "category": "Conflict", "fact": "Disagreement about screen time rules" }
]
```

### Global Fact Consolidation Prompt
```
You are consolidating facts about a user across sessions.

CURRENT GLOBAL FACTS:
[existing global facts, may be empty]

NEW SESSION FACTS:
[session facts being merged]

TASK:
1. Merge into a single User Profile
2. Deduplicate (keep most recent/specific version)
3. Resolve conflicts (trust newer session)
4. Group by category
5. Prune temporary/outdated info
6. HARD LIMIT: Maximum 50 facts

Output JSON array of {category, fact} objects.
```

---

## Context Format (Updated)

```
GLOBAL USER PROFILE (from prior sessions):
[People]: Daughter Emma is 14, works as a teacher
[Logistics]: Works night shifts, custody alternates weekly

EMOTIONAL STATE:
Current intensity: 7/10
Trend: de-escalating

SESSION SUMMARY:
Key themes: communication breakdown, feeling unheard
Current focus: Improving active listening

FROM USER'S PRIVATE REFLECTIONS:
...

USER MEMORIES (Always Honor These):
...

NOTED FACTS FROM THIS SESSION:
[Conflict]: Current disagreement about screen time
[Emotional]: Feeling unheard and frustrated
```

---

## Verification

**Manual Testing Checklist:**
1. Reset database: `npx prisma migrate reset`
2. Send several messages in a partner session
3. Verify facts appear in response context (check logs)
4. Check `UserVessel.notableFacts` via Prisma Studio - should be JSON with categories
5. Check `UserVessel.contentEmbedding` is populated
6. Verify `Message.embedding` column does **not exist**
7. Advance to Stage 2
8. Check `User.globalFacts` is populated
9. Start new session with same partner
10. Verify global facts appear in prompt context

---

## Code Deletion Checklist

**embedding.ts - DELETE these functions:**
- [ ] `embedMessage()`
- [ ] `embedMessages()`
- [ ] `embedInnerWorkMessage()`
- [ ] `findSimilarMessages()`
- [ ] `findSimilarInnerWorkMessages()`
- [ ] `findSimilarInnerThoughtsWithBoost()`

**session-processor.ts - DELETE these lines (269-274):**
- [ ] `embedMessage(userMessage.id, turnId).catch(...)`
- [ ] `embedMessage(aiMessage.id, turnId).catch(...)`

**context-retriever.ts - DELETE these functions:**
- [ ] `searchAcrossSessions()`
- [ ] `searchWithinSession()`
- [ ] `searchInnerWorkMessages()`

**context-assembler.ts - DELETE:**
- [ ] `buildPriorThemes()`
- [ ] `PriorThemes` interface
- [ ] `priorThemes` from `ContextBundle`

---

## No Rollback Plan

This is a clean-slate implementation. If issues occur:
1. Fix forward - the old architecture is removed
2. `contentEmbedding` is the single source of truth
3. Database can be reset during development
